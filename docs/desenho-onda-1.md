# Desenho da onda 1 (antes do código)

Desenho e entrega da primeira leva da onda 1 (T1, T2, T3, T5 e T6, todas na `main`). Vale como
referência de como cada parte funciona e do que as próximas tasks usam; as seções "Entregue" no fim
prevalecem sobre o desenho original quando divergem.

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

## T1: domínio (na `main`)

API pública em `src/domain/`, com 107 testes que passam em qualquer fuso da máquina:

- `priority.ts`: `derivePriority`, `PRIORITY_DEADLINES` e `explainPriority` ("Alta: impede uma pessoa
  de trabalhar. Prazo: 4 horas úteis.").
- `business-hours.ts`: `addBusinessHours(start, hours)`, com seg–sex 8h–18h em `America/Sao_Paulo`
  via `Intl`, sem dependência nova.
- `sla.ts`: `computeDueAt`, `isOverdue`, `timeUntilDue` (tempo corrido), `getSlaState`
  (`closed | paused | overdue | due_soon | on_time`, para a cor do selo) e `formatSlaBadge`
  ("encerrado", "prazo pausado", "no prazo" a partir de 24h, "vence em Nh/N min",
  "vencido há N min/h/dias").
- `ticket-rules.ts`: `findDuplicateCandidates` (abertos e encerrados há até 30 dias) e
  `suggestDuplicateAction` (`update | reopen | new_with_reference`).
- `conversation-fsm.ts`: `transition(status, event): Result`, `canTransition` e `TRANSITION_EVENTS`
  (transição → evento da mensagem `system`).
- `sensitive-data.ts`: `maskSensitiveData` de verdade, com `PASSWORD_PLACEHOLDER` e `TOKEN_PLACEHOLDER`.

Uso pelas outras tasks: a T9 usa `isOverdue`; a T7 usa `formatSlaBadge` + `getSlaState`; a T11 usa
`derivePriority`, `explainPriority` e `computeDueAt`; a T3/T10 filtram o `findSimilar` com
`findDuplicateCandidates` e escolhem a proposta com `suggestDuplicateAction`; a T5/T12 validam
mudanças de estado com `transition`.

Pontos registrados:

- `ConversationTransition` é um union em `conversation-fsm.ts`, não um array em `enums.ts` (para não
  mexer no contrato). Se a T12 precisar de validator Convex para ele, vira array em `enums.ts`.
- O ajuste de fuso é exato para São Paulo (sem horário de verão desde 2019); vai no README junto com
  "sem feriados".
- Encerrado sem `resolvedAt` usa `lastActivityAt` na janela de 30 dias: **a T3 deve gravar
  `resolvedAt` também ao fechar**.
- A seed foi conferida por um teste que varre a semana em passos de 15 min: INC-20311 sempre vencido;
  INC-20402, REQ-10442, INC-20395, REQ-10498 e INC-20420 nunca.

## T2: auth, seed e login (na `main`)

Como rodar: `npm ci` → `CONVEX_AGENT_MODE=anonymous npx convex dev` → `npm run setup:auth` (gera
`JWT_PRIVATE_KEY`, `JWKS` e `SITE_URL` no deployment) → `npm run seed` → `npm run dev`.

O que as outras tasks usam:

- **Token no servidor do Next (T5):** `createConvexClientForCurrentUser()` em
  `src/features/auth/server.ts` devolve um `ConvexHttpClient` com `setAuth`, ou `null` sem sessão
  (a rota responde 401).
- **No cliente:** o `ConvexClientProvider` já envolve o app; `api.auth.currentPerson` devolve
  `{ name, email, role, department, level }` ou `null`.
- **Sair:** `<SignOutButton />` em `src/features/auth/sign-out-button.tsx` (aceita props do Button).
- **Rotas protegidas:** regras em `src/features/auth/route-access.ts` (`HOME_BY_ROLE`,
  `decideRedirect`). O proxy decide `/`, `/login`, `/chat/**` e `/console/**`; `/api/*` passa direto
  e cada rota autentica sozinha. **Página nova protegida (ex.: perfil da T20) precisa entrar ali.**
- **Páginas provisórias:** `src/app/chat/page.tsx` e `src/app/console/page.tsx` (marcadas
  PROVISÓRIO). T5 e T12 substituem e podem apagar `src/features/auth/provisional-area.tsx`.
- **`convex/http.ts`** só registra as rotas do auth; a T3 acrescenta `registerTicketingRoutes(http)`.
- **Testes com convex-test:** começam com `/// <reference types="vite/client" />`; o helper `loginAs`
  em `convex/__tests__/guards.test.ts` simula a sessão.
- **Guards:** ganharam `getCurrentPerson(ctx)` (pessoa ou `null`).

Desvios registrados:

- **"Manter conectado":** o Convex Auth só aceita uma duração de cookie global. O login grava o
  cookie `nexo-remember`, e o proxy escolhe entre duas instâncias do middleware (30 dias × sessão).
- **Cache Components:** o provider de servidor do Convex Auth lê cookies e `Date.now()`, então fica
  num `<Suspense>` com `connection()`. Efeito: um loader breve antes de toda página.
- **Seed:** rodar de novo devolve chamados e a conversa do Pedro ao estado inicial; pessoas e
  artigos são atualizados; contadores ficam com o maior valor. A conversa do Pedro inclui o rascunho
  D-380 já confirmado, para o card aparecer coerente.
- **Contas de demonstração:** o clique preenche o e-mail e, com a senha vazia, a senha
  "demonstracao".
- O `.env.example` ainda não cita as variáveis do Convex Auth (ficam no README, T18).

## Entregue: T3 (na `main`)

- **API HTTP:** `POST <NEXT_PUBLIC_CONVEX_SITE_URL>/ticketing/<op>` com `Authorization: Bearer
<TICKETING_SERVICE_KEY>`, `X-Employee-Id` (precisa ser `employee`) e `Idempotency-Key` nas
  escritas (sem ela, 422). Corpos: `listMine { filter? }`, `getMine { code }`,
  `findSimilar { description, category | null }`, `create { ticket }`,
  `addUpdate { code, update: { text, fieldChanges? } }` (autor sempre `employee`),
  `reopen { code, reason }`, `markHandoff { code | null, conversationId }`.
- **`resolvedAt`** é gravado ao resolver e ao fechar; voltar a um status aberto limpa.
- **Gateway na T10:** uma instância por requisição,
  `new HttpTicketGateway({ baseUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL, serviceKey:
process.env.TICKETING_SERVICE_KEY, employeeId: person._id, onAttempt })`. A chave de
  idempotência das escritas é o `_id` da `pendingAction`.
- **Configuração:** `TICKETING_SERVICE_KEY` no `.env.local` (só servidor, sem `NEXT_PUBLIC`) **e** no
  Convex (`npx convex env set TICKETING_SERVICE_KEY <mesmo valor>`). Sem ela no Convex, tudo volta
  401, que o gateway trata como `unavailable`.
- **Para a T12:** a internal mutation `addUpdate` aceita `authorType`/`authorName` (analista renova o
  prazo); `employeeTickets` devolve só `TicketSummary[]`, então falta uma query de detalhe com
  histórico para o painel do funcionário.
- **Pendências pequenas:** a chave de serviço é comparada por igualdade simples, não em tempo
  constante; o teste do gateway contra a API real foi removido porque o `tsc -p convex` não resolve
  o alias `@/` (a API está coberta por `t.fetch` e o gateway, por `fetch` falso).

## Entregue: T5 (na `main`)

- **`runTurn(input, { sleep? })`** em `src/agent/pipeline/run-turn.ts`, com `RunTurnInput`
  `{ conversationId, assistantMessageId, userText (já mascarado), convex (autenticado como o
funcionário), agentSecret }`. Nunca lança: falha vira `fail`. A T10 troca só o corpo do eco.
- **Lotes de ~150 ms:** `src/agent/pipeline/streaming-message.ts` (`StreamingMessage` com `write`,
  `flush`, `finish(parts, decisionId?)`, `fail`, `stopped`, e `createConvexMessageSink`).
- **Escritas do agent** (`convex/messages.ts`, com segredo): `appendDelta`, `finalize` e `fail`;
  devolvem `false` quando a mensagem já não está em `streaming`. Timeout: internal `expireTurn` em
  60 s.
- **`sendUserMessage`** devolve `Result<{ conversationId, userMessageId, assistantMessageId | null,
savedText, masked }, "not_found" | "closed" | "busy" | "limit_reached" | "empty">`. A rota responde
  202 quando o agent vai responder e 201 quando só salva (conversa com analista).
- **Acréscimos:** campo `conversations.subject`; `messages.list` traz `analyst: { name, level }`;
  mutation `conversations.requestAnalyst` (o "Falar com um analista" do limite, motivo `requested`,
  com `outOfHours`); query `conversations.messageLimit`.
- **Ids malformados, inexistentes e alheios** dão o mesmo `not_found` (`normalizeId`).
- **Para a T11:** a parte `error` aparece sem "Tentar de novo" (a rota de retry é da T11).
- **Para a T20:** "Meu perfil" está desabilitado na navegação.
- **Polimento (T19):** abaixo de 768 px a lateral some e o histórico não aparece no celular; opções
  rápidas e seletor enviam o `label` e só a última mensagem fica clicável.

## Entregue: T6 (na `main`)

- **`src/agent/llm/models.ts`:** `readLlmConfig(env)`, `MODEL_PRICES`, `estimateCostUsd` (com desconto
  de cache) e `estimateTranscriptionCostUsd` (mínimo de 10 s). **`provider.ts`:**
  `createLlmModels(config, fetch?)` → `{ fast, main, transcription }`.
- **`@ai-sdk/groq` fixado em 4.0.63**, a versão do provider que o Mastra 1.80 embute (a 4.0.72 não
  compila com `new Agent({ model })`). Atualizar os dois juntos.
- **Variável nova opcional:** `TRANSCRIPTION_MODEL=whisper-large-v3-turbo`.
- **`npm run spike:llm`** mede tudo com a chave (pendente). Guia para a T10 em
  `docs/decisoes/mastra-api.md`; escolha e custos em `docs/decisoes/llm.md` (estimativa de
  ~US$ 0,0012 por turno e ~US$ 0,01 por conversa de 8 mensagens).
- **Regras para a T10:**
  1. No `Agent`, `errorProcessorDefaults: false` e `modelSettings.maxRetries: 1`; senão o Mastra soma
     retentativas próprias (medido: 9 requisições e ~15 s num 429).
  2. Contexto da sessão em closure nas tools (não precisa de `requestContext`).
  3. Histórico como união discriminada por `role`.
  4. ENTENDER e AGIR em chamadas separadas (com tools, o Groq troca a saída estruturada por uma tool).
  5. `stream` não lança: o erro fica em `out.error` (`classifyProviderError` para 429,
     `isMastraTimeoutError` para timeout); `generate` lança.
  6. `out.usage` já vem somado na 1.80; por passo, `out.steps[i].usage`.
  7. Transcrição: `models.transcription.doGenerate({ audio, mediaType, providerOptions: { groq: {
language: "pt" } } })` (compila, não testado).
