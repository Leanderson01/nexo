# Guia prático: Mastra 1.80 + Groq para a T10

Versões: `@mastra/core@1.80.0` e `@ai-sdk/groq@4.0.63` (fixa, ver armadilhas). A doc que bate com a
versão instalada fica em `node_modules/@mastra/core/dist/docs/references/`. Tudo o que está marcado
como **provado** abaixo tem teste em `src/agent/llm/__tests__/mastra-groq.test.ts` (Mastra e
provider de verdade, só o `fetch` é falso). Os trechos compilam com o `tsconfig` do projeto.

## 1. Config e modelos

```ts
import { Agent } from "@mastra/core/agent";
import { classifyProviderError, MastraError } from "@mastra/core/error";
import { isMastraTimeoutError } from "@mastra/core/loop";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { estimateCostUsd, estimateTranscriptionCostUsd, readLlmConfig } from "@/agent/llm/models";
import { createLlmModels } from "@/agent/llm/provider";
import { understandingSchema } from "@/agent/pipeline/understanding-schema";
import type { Understanding } from "@/domain/understanding";

const config = readLlmConfig(process.env); // lança nomeando a variável que falta
const models = createLlmModels(config); // { fast, main, transcription }

type ChatMessage = { role: "user"; content: string } | { role: "assistant"; content: string };
```

`ChatMessage` precisa ser união discriminada: `{ role: "user" | "assistant" }` não compila em
`generate`/`stream`.

## 2. ENTENDER: saída estruturada, sem tools

```ts
export async function understand(history: ChatMessage[]): Promise<Understanding> {
  const agent = new Agent({
    id: "understand",
    name: "understand",
    instructions: UNDERSTAND_PROMPT,
    model: models.fast,
    errorProcessorDefaults: false, // sem as 2 retentativas escondidas do Mastra
  });
  const out = await agent.generate(history, {
    structuredOutput: { schema: understandingSchema },
    providerOptions: { groq: { reasoningEffort: "low" } },
    modelSettings: { maxRetries: 1, temperature: 0, timeout: { totalMs: 8_000 } },
  });
  // out.totalUsage -> custo do ENTENDER
  return out.object;
}

export function isInvalidStructuredOutput(error: unknown): boolean {
  return error instanceof MastraError && error.id === "STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED";
}
```

**Provado:**

- Vai `response_format: { type: "json_schema", json_schema: { strict: true, schema } }` e nenhuma
  tool. Todos os campos entram em `required`, objetos com `additionalProperties: false`, `nullable`
  vira `type: [x, "null"]` ou `anyOf` com `null`.
- **Decisão 18:** a confiança vai como `{ type: "number", minimum: 0, maximum: 1 }` no modo
  estrito. Se o Groq recusar, o erro é um 400 (`classifyProviderError` → `invalid_request`) na
  primeira chamada; o `npm run spike:llm` detecta e avisa. Saídas, sem mudar o tipo do domínio:
  - **A:** `providerOptions: { groq: { strictJsonSchema: false } }` só no ENTENDER (provado que vai
    `strict: false` com o mesmo schema);
  - **B:** mandar `understandingSchema.extend({ confidence: z.number() })` (provado que sai sem
    limite), limitar a confiança em código e validar com `understandingSchema.parse`.
- Resposta fora do schema (ex.: `confidence: 1.5`) **lança** `MastraError` com id
  `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED`. É o gancho da "nova tentativa com lembrete do
  schema" (§10): pegue com `isInvalidStructuredOutput`, acrescente o lembrete e chame de novo.
- `generate` **lança** nos erros (429, timeout, validação); `stream` não (ver 4).

## 3. Tools por requisição, com o contexto em closure

```ts
interface SessionContext {
  employeeId: string;
  conversationId: string;
}

export function createTools(session: SessionContext) {
  return {
    listMyTickets: createTool({
      id: "listMyTickets",
      description: "Lista os chamados do funcionário logado, com o selo de prazo.",
      inputSchema: z.object({ status: z.enum(["open", "all"]).nullable() }),
      execute: async ({ status }) => ({
        codes: await listTicketsOf(session.employeeId, status ?? "open"),
      }),
    }),
  };
}
```

**Provado:** a tool executa com o `employeeId` da closure, e nem o nome `employeeId` nem o valor
aparecem no schema enviado ao modelo. O resultado volta ao modelo como mensagem `tool`. A assinatura
é `execute(input, context)`; o segundo argumento traz `requestContext`, `abortSignal` etc., e não
precisamos dele. `withTrace(tool)` (§5.8) embrulha o `execute` sem mudar a assinatura.

## 4. AGIR: stream, texto em pedaços, uso e erros

```ts
export async function act(
  session: SessionContext,
  history: ChatMessage[],
  onText: (piece: string) => void,
) {
  const agent = new Agent({
    id: "act",
    name: "act",
    instructions: ACT_PROMPT,
    model: models.main,
    tools: createTools(session),
    errorProcessorDefaults: false,
  });
  const out = await agent.stream(history, {
    maxSteps: 5,
    providerOptions: { groq: { reasoningEffort: "low" } },
    modelSettings: { maxRetries: 1, timeout: { firstChunkMs: 10_000, totalMs: 45_000 } },
  });
  for await (const piece of out.textStream) onText(piece);

  if (out.error) {
    // O stream não lança: o erro fica em out.error e finishReason vira "error".
    const kind = isMastraTimeoutError(out.error) ? "timeout" : classifyProviderError(out.error);
    return { ok: false as const, kind };
  }
  const usage = await out.totalUsage; // soma de todos os passos
  return {
    ok: true as const,
    text: await out.text,
    usage,
    costUsd: estimateCostUsd(
      config.mainModel,
      usage.inputTokens ?? 0,
      usage.outputTokens ?? 0,
      usage.cachedInputTokens ?? 0,
    ),
  };
}
```

**Provado:**

- `textStream` entrega os pedaços na ordem do provedor; `out.text` tem o texto inteiro e
  `out.finishReason` fica `"stop"`. Os lotes de ~150 ms da T5 continuam do nosso lado.
- `totalUsage` soma os passos (tool + resposta), incluindo `cachedInputTokens`. **Diferente do que
  o desenho dizia, `out.usage` também vem somado no 1.80**; o uso de cada passo está em
  `(await out.steps)[i].usage`.
- 429 com `maxRetries: 1` e `errorProcessorDefaults: false`: exatamente 2 requisições, depois
  `out.error` com `classifyProviderError(out.error) === "rate_limited"` e `finishReason: "error"`.
- `timeout.firstChunkMs` estourado: `isMastraTimeoutError(out.error)`; no `generate`,
  `totalMs` lança `MastraTimeoutError` (`timeoutType: "total"`).

Outros controles úteis: `stopWhen`, `toolChoice`, `abortSignal`, `onStepFinish` (bom lugar para o
`DecisionRecord` ver cada passo), `onFinish`, `onError`.

## 5. Transcrição (T15)

```ts
export async function transcribe(audio: Uint8Array, mediaType: string) {
  const result = await models.transcription.doGenerate({
    audio,
    mediaType,
    providerOptions: { groq: { language: "pt" } },
  });
  return {
    text: result.text,
    costUsd: estimateTranscriptionCostUsd(config.transcriptionModel, result.durationInSeconds ?? 0),
  };
}
```

Chamada direta ao modelo do provider, sem Mastra e sem o pacote `ai` (não instalado). Não testado
offline; a T15 confere com a chave.

## Armadilhas

- **`runtimeContext` → `requestContext`.** A spec fala em `runtimeContext`; no 1.x o nome é
  `requestContext`. Não usamos nenhum dos dois: o contexto vai em closure (seção 3).
- **Retentativas em dobro.** Por padrão o agent liga o `StreamErrorRetryProcessor` (2 retentativas
  com 3 s de espera) **por cima** do `modelSettings.maxRetries` (padrão 2). Medido com 429: 9
  requisições e ~15 s antes de falhar. Para a "uma retentativa" da §10, use sempre
  `errorProcessorDefaults: false` no `Agent` e `modelSettings.maxRetries: 1`. A espera interna
  respeita o `retry-after` (até 30 s) com backoff de 1 s, 2 s...
- **Versão do `@ai-sdk/groq`.** Ela precisa usar o mesmo `@ai-sdk/provider` que o `@mastra/core`
  embute (4.0.29 no 1.80). Com o `@ai-sdk/groq@4.0.72` (provider 4.0.34), `new Agent({ model })` não
  compila. Ao subir o Mastra, confira `@ai-sdk/groq-v7` e `@ai-sdk/provider-v7` no `package.json`
  dele e acompanhe.
- **Groq e saída estruturada com tools.** Com tools no agent, o provider não manda
  `response_format`: ele cria uma tool `json` e força `tool_choice: "required"`. Funciona, mas muda
  o comportamento do AGIR. Mantenha ENTENDER (estruturado, sem tools) e AGIR (texto, com tools) em
  chamadas separadas, como no desenho.
- **Sem memória.** Não passe `memory` nem registre o agent numa instância `Mastra`: o histórico
  entra pelas mensagens (§5.2).
- **gpt-oss raciocina.** Tokens de raciocínio contam como saída e atrasam o primeiro token; use
  `reasoningEffort: "low"` e meça com o `spike:llm`.
- **`parallelToolCalls`.** O 120b não faz tools em paralelo; não conte com isso.
- **Chave.** O `createGroq` recebe a chave do `readLlmConfig`; nunca dependa do `GROQ_API_KEY`
  implícito do SDK, para o erro de config nomear a variável.

## O que a T10 não precisa mudar

Nenhum contrato de `src/domain`, o `understandingSchema` e o schema do Convex ficam como estão. Se
a decisão 18 cair no plano B, o schema sem limite é derivado na hora (`extend`), sem tocar no
original.
