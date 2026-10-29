# Desenho da onda 1 (antes do código)

Desenho fechado pelos agents da primeira leva, que foram bloqueados antes de escrever código (a sessão
original rodava fora deste repo). Quem retomar uma task começa daqui; o que estiver aqui vale como
decisão, salvo se contrariar a spec ou o `TASKS.md`.

## T3: serviço de chamados + `HttpTicketGateway`

**Arquivos**

- `convex/ticketing/reads.ts`: leituras e mapeamento compartilhados (doc → `Ticket`, `TicketSummary`,
  `TicketDetail`). `findOwnedTicket(employeeId, code)` devolve `null` tanto para chamado alheio quanto
  para inexistente, com uma única `TICKET_NOT_FOUND_MESSAGE`. `ServiceError { kind, message }` é
  definido localmente, porque o bundler do Convex não resolve o alias `@/` de `gateway-error.ts`.
- `convex/ticketing/similarity.ts`: função pura. Normaliza (minúsculas, NFD sem acento, sem palavras
  vazias em português); pontuação = palavras em comum + 1 se a categoria bate; mantém pontuação > 0,
  top 5, desempate pela `lastActivityAt` mais recente. Janela: abertos ou resolvidos/fechados há até
  30 dias (decisão 15).
- `convex/ticketing/chaos.ts`: lê `TICKETING_FAILURE_RATE` e `TICKETING_LATENCY_MS` ("200-1500");
  ausente ou inválido = sem caos.
- `convex/ticketing/service.ts`: escritas em internal mutations.
  - `create`: contador + 1, código com 5 dígitos; sem contador, começa em 00001.
  - `addUpdate`: só autor analista/agent renova `lastActivityAt`. Pela API HTTP o autor é `employee`
    (no F3 a informação é do funcionário). Funcionário não muda `status` (`validation`); chamado
    fechado → `conflict`.
  - `reopen`: exige `canReopen`, senão `conflict`. Status `open`, limpa `resolvedAt`, renova
    `lastActivityAt` (decisão 6) e registra um update do funcionário com o motivo.
  - `markHandoff`: nota de sistema e status `awaiting_analyst` se o chamado estiver aberto. **Não**
    renova `lastActivityAt` (um vencido continua vencido para o analista). `code` nulo = nada a fazer.
  - Idempotência: chave já usada devolve o chamado gravado, mas só se o funcionário for o dono (senão
    `not_found`).
- `convex/ticketing/http.ts`: `registerTicketingRoutes(http)`; `convex/http.ts` fica mínimo.
  - `POST /ticketing/{listMine|getMine|findSimilar|create|addUpdate|reopen|markHandoff}`, corpo JSON
    validado com Zod derivado de `enums.ts`.
  - Headers: `Authorization: Bearer <TICKETING_SERVICE_KEY>`, `X-Employee-Id` (confiável porque só o
    servidor do Next tem a chave) e `Idempotency-Key` nas escritas.
  - Respostas: 200 `{ ok: true, value }`; 401; 404, 409, 422 e 503 com `{ ok: false, error: { kind,
message } }`; inesperado = 500 com `kind: "unavailable"`.
  - Caos aplicado depois da autenticação: primeiro a latência, depois o 503.
- `convex/ticketing/queries.ts`: `listMine`, `getMine` (`requireEmployee`) e `employeeTickets`
  (`requireAnalyst`), devolvendo dados crus; o selo de SLA é calculado na UI.

**Gateway** (`src/agent/gateways/http-ticket-gateway.ts`)

- Opções: `{ baseUrl, serviceKey, employeeId, fetch?, sleep?, random?, timeoutMs = 2000, onAttempt? }`.
- **3 tentativas**, esperas de ~300 ms e ~900 ms (±20% de jitter) e **2.000 ms de limite por
  tentativa** (decisão 16).
- Repete só em 5xx, timeout (`AbortController`) e erro de rede. 4xx não repete; 401 vira `unavailable`.
- `markHandoff` usa a chave `handoff:<conversationId>:<code>`, já que a porta não recebe chave.
- `onAttempt({ method, attempt, ok, latencyMs, errorKind? })` alimenta o `withTrace` da T10.

**Testes**: `import.meta.glob` inline em cada teste (sem `convex/test.setup.ts` compartilhado, para não
conflitar com a T2). Identidade: `t.withIdentity({ subject: \`${userId}|s\` })`, porque o
`getAuthUserId`separa o`subject` em "|".

## T5: chat em tempo real

- **`sendUserMessage` devolve `Result`** com os códigos `not_found`, `closed`, `busy`, `limit_reached`
  e `empty`; a rota converte em 404/409/400. Só os guards lançam exceção.
- **Campo novo opcional `conversations.subject`**, preenchido pela primeira mensagem do funcionário,
  para a lista do histórico.
- **`conversations.get`** devolve também `messageLimit` (lido do env) e nome e nível do analista.
- **Timeout**: internal mutation agendada para 60 s; não faz nada se a mensagem já não está `streaming`.
- **Escritas do agent** (`appendDelta`, `finalize`, `fail`): não fazem nada em mensagem que não está
  `streaming`. `finalize` acrescenta as partes estruturadas depois do texto já transmitido.
- **Token no servidor**: `convexAuthNextjsToken()` de `@convex-dev/auth/nextjs/server`.
- **Next 16 com `cacheComponents`**: `/chat/[conversationId]` lê o parâmetro com `useParams` dentro de
  um `<Suspense>`, senão o build falha.
- Testes com a mesma identidade da T3.

## T6: Mastra + Groq (pesquisa feita; medição pendente da chave)

Doc do Mastra 1.80 que bate com a versão instalada: `node_modules/@mastra/core/dist/docs/references/`.

- **Provider**: `@ai-sdk/groq` com `createGroq({ apiKey })`, passando o modelo direto em
  `new Agent({ model })`. A chave vem do nosso leitor de env, e ganhamos `providerOptions.groq`
  tipado (`strictJsonSchema`, `reasoningEffort`, `parallelToolCalls`, `serviceTier`) e
  `.transcription("whisper-large-v3-turbo")` no mesmo provider.
- **Saída estruturada**: `agent.generate(msgs, { structuredOutput: { schema } })` → `.object`. Sem
  tools, vai `json_schema` com `strict: true`. O Groq **não combina** saída estruturada com tools nem
  com streaming, então o ENTENDER é uma chamada separada, sem tools (já era o desenho).
  - **Risco**: o modo estrito pode recusar o `min(0).max(1)` de `confidence`. Saídas: desligar o
    `strictJsonSchema` só no ENTENDER (Zod valida depois) ou tirar o limite do schema enviado e
    limitar em código. O tipo do domínio não muda em nenhum dos casos.
- **Tools**: `createTool({ id, description, inputSchema, outputSchema, execute })`. `execute` é função
  comum, então `createTools(sessionContext)` com o `employeeId` em closure funciona. A spec fala em
  `runtimeContext`; o nome atual é `requestContext`.
- **Streaming**: `const out = await agent.stream(msgs, opts)`; `out.textStream` para os pedaços de
  texto ou `out.fullStream` para os eventos tipados; no fim, `out.text`, `out.toolCalls`,
  `out.steps`, `out.finishReason`.
- **Tokens**: `await out.totalUsage` (soma de todos os passos; `usage` é só o último). O Groq aplica
  cache de prompt automático no gpt-oss, com 50% de desconto na entrada em cache.
- **Controles**: `maxSteps`, `stopWhen`, `toolChoice`, `modelSettings` (`temperature`,
  `maxOutputTokens`, `maxRetries`, `timeout: { totalMs, stepMs, firstChunkMs }`, que lança
  `MastraTimeoutError`), `abortSignal`, `onStepFinish`, `onFinish`, `onError`.
- **Sem memória**: `memory` é opcional; sem instância `Mastra` nem storage, o agent não guarda estado
  e o histórico entra pelas mensagens.

**Modelos e preços** (doc do Groq em 29/10/2026)

| Papel                      | Modelo                   | Entrada / saída por M tokens | Observação                               |
| -------------------------- | ------------------------ | ---------------------------- | ---------------------------------------- |
| Rápido (ENTENDER, resumos) | `openai/gpt-oss-20b`     | US$ 0,075 / 0,30             | ~1.000 tokens/s                          |
| Principal (AGIR)           | `openai/gpt-oss-120b`    | US$ 0,15 / 0,60              | ~500 tokens/s; sem tools em paralelo     |
| Transcrição                | `whisper-large-v3-turbo` | US$ 0,04 / hora              | mínimo cobrado de 10 s; `language: "pt"` |

Kimi K2 e Llama 4 saíram do Groq; Qwen 3.8 está em preview e custa de 5 a 7 vezes mais.

**Limite de taxa**: a tabela base mostra 30 req/min, 1.000 req/dia e **8.000 tokens/min** por modelo.
Isso aperta o runner de evals: é preciso esperar e repetir no 429 usando `retry-after`. Os headers
`x-ratelimit-*` informam o restante. Conferir no console o limite real da chave paga.

**Plano de retomada da T6**

1. `src/agent/llm/models.ts` puro: `readLlmConfig(env)` com erro que nomeia a variável ausente,
   `MODEL_PRICES`, `estimateCostUsd` e `estimateTranscriptionCostUsd` (mínimo de 10 s), com testes.
2. `src/agent/llm/provider.ts` com `createGroq`.
3. Teste de integração offline: Mastra + `@ai-sdk/groq` com `fetch` falso, conferindo o JSON schema
   enviado, as tools em closure, os pedaços de texto e o `totalUsage`, sem precisar da chave.
4. `scripts/spike-llm.ts` pronto para rodar quando a chave estiver no `.env.local`.

A worktree `T6-spike-llm` já tem `@mastra/core@1.80.0`, `@ai-sdk/groq@4.0.72` e `tsx` instalados,
com `package.json` e `package-lock.json` alterados e ainda sem commit.
