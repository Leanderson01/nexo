# Nexo Assist: controle de tasks

Arquivo de controle do projeto. Fonte das regras: `nexo-assist-especificacao.md` (fora do git; seções citadas como §N).

## Como usar

- Ao pegar uma task: mude o status para `em andamento` e preencha a branch.
- Ao terminar: `feito`, com o commit ou PR de merge.
- Uma branch por task (`task/T3-ticketing`), rebase em `main` antes do merge para manter o histórico linear.
- Decisões e dúvidas vão na seção "Decisões em aberto", não espalhadas pelo código.

Status: `a fazer` · `em andamento` · `bloqueada` · `feito`

## Quadro

| Task | Descrição | Onda | Depende de | Status | Branch / commit |
|---|---|---|---|---|---|
| T0.1 | Repositório e setup | 0 | — | a fazer | |
| T0.2 | Contratos travados | 0 | T0.1 | a fazer | |
| T1 | Domínio puro + testes | 1 | T0 | a fazer | |
| T2 | Auth, seed e login | 1 | T0 | a fazer | |
| T3 | Serviço de chamados + gateway | 1 | T0 | a fazer | |
| T4 | Central de ajuda | 1 | T0 | a fazer | |
| T5 | Chat core com agent de eco | 1 | T0 | a fazer | |
| T6 | Teste do Mastra + escolha do LLM | 1 | — | a fazer | |
| T7 | Blocos de mensagem | 1 | T0, protótipo | bloqueada | |
| T8 | Painel de decisão | 1 | T0 | a fazer | |
| T9 | Políticas de decisão | 1 | T0, T1 | a fazer | |
| T14a | Cenários de eval (escrita) | 1 | T0 | a fazer | |
| T10 | Pipeline do agent | 2 | T3, T4, T5, T6, T9 | a fazer | |
| T11 | Rascunho fora do LLM | 2 | T3, T5, T7 | a fazer | |
| T12 | Console do analista | 2 | T2, T5, T7, T8 | a fazer | |
| T15 | Voz | 2 | T5 | a fazer | |
| T14b | Runner de evals | 3 | T10, T11 | a fazer | |
| T16 | Limites e custo | 3 | T10 | a fazer | |
| T17 | Faixa 2 | 3 | T10, T12 | a fazer | |
| T18 | README e deploy | 3 | tudo | a fazer | |
| T19 | QA de ponta a ponta | 3 | tudo | a fazer | |

## Decisões em aberto

1. **Seed da Mariana em `waiting_analyst`:** quem entra como Mariana cai numa conversa com o agent pausado e não consegue testar o chamado vencido.
2. **Chamado vencido × chamado em foco:** a `OverdueTicketPolicy` roda no DECIDIR, antes do `selectTicket` do AGIR. Proposta: resolver o `ticketRef` em código entre ENTENDER e DECIDIR.
3. **REQ-10442 pode aparecer vencido** dependendo da hora (Baixa, 50h úteis, atividade há exatos 7 dias, `Aprovado` não pausa o prazo).
4. **Códigos sequenciais:** falta a tabela `counters` no modelo de dados (incluída no T0.2).
5. **Limite de 30:** conta só as mensagens do funcionário ou todas?
6. **Reabertura renova `lastActivityAt`?**
7. **Protótipo (Anexo C):** necessário para T7, T8 e T12.
8. ~~**Provedor de LLM**~~ → **Groq** (única chave disponível). Candidatos a validar no T6: `openai/gpt-oss-20b` (rápido, saída estruturada strict) e `openai/gpt-oss-120b` (principal, tool calling); reserva: Kimi K2 ou Qwen3. Transcrição também pelo Groq (Whisper). Pendente: medir PT-BR e o limite de taxa do plano da chave.

---

## Detalhe das tasks


O que destrava o paralelismo é **congelar os contratos antes de abrir as frentes**: enums, tipos (`MessagePart`, `PendingAction`, `DecisionRecord`, `Understanding`), schema do Convex, interfaces (`TicketGateway`, `KnowledgeGateway`, `Policy`/`TurnContext`) e assinaturas dos guards. Com isso pronto, cada frente programa contra o contrato e usa fixtures/stubs no lugar das outras.

Caminho crítico: **T0 → (T3 + T6 + T5) → T10 → T14 → T18**. O resto corre em volta.

```
Onda 0 (sequencial)   T0 setup + contratos
                         │
Onda 1 (paralela)     T1 domínio · T2 auth/seed/login · T3 ticketing+gateway · T4 central de ajuda
                      T5 chat core (agent eco) · T6 spike Mastra/LLM · T7 blocos de mensagem
                      T8 painel de decisão · T9 políticas · T14a cenários de eval (só escrita)
                         │
Onda 2 (integração)   T10 pipeline do agent · T11 rascunho fora do LLM · T12 console · T15 voz
                         │
Onda 3 (fechamento)   T14b runner de evals · T16 limites/custo · T17 faixa 2 · T18 README+deploy · T19 QA ponta a ponta
```

---

## Onda 0: fundação (uma pessoa, antes de tudo)

### T0.1 Repositório e setup (F0)
- Repo próprio do Nexo (o histórico de commits é avaliado).
- Next.js (versão atual; conferir se `middleware` virou `proxy`), TS `strict`, ESLint, Prettier, Vitest, Convex.
- Estrutura de pastas da §5.4, `.env.example` da §12.4, scripts `dev`, `seed`, `test`, `evals`.
- **Pronto quando:** `npm run dev`, `npx convex dev` e `npm test` rodam limpos.

### T0.2 Contratos congelados
- `src/domain/enums.ts` (arrays `as const`) e derivação para TS, Zod e validators Convex (§5.8).
- `src/domain/result.ts`.
- Tipos: `Ticket`, `TicketSummary/Detail`, `MessagePart`, `PendingAction`, `DecisionRecord`, `HandoffReason`, `ConversationEvent`, `Understanding` (Zod, §6.2).
- Interfaces: `TicketGateway`, `KnowledgeGateway`, `Policy`, `PolicyResult`, `TurnContext`.
- `convex/schema.ts` completo (§5.11) **+ tabela `counters`** para os códigos sequenciais.
- `convex/lib/guards.ts` com assinaturas (implementação real em T2).
- **Pronto quando:** tudo compila e cada frente da onda 1 consegue começar sem esperar outra.

---

## Onda 1: frentes paralelas

### T1 Domínio puro + testes (F1)
Depende de: T0. Sem LLM, sem Convex.
- `priority.ts` (`derivePriority`, matriz completa testada).
- `sla.ts`: `computeDueAt`, `isOverdue`, `timeUntilDue`, `formatSlaBadge`; horário útil 8h–18h seg–sex `America/Sao_Paulo`, 3d=30h, 5d=50h, Crítica 1h corrida, pausa em "Aguardando você".
- `ticket-rules.ts`: `isOpen`, `canReopen` (limite de 7 dias), `findDuplicateCandidates`.
- `conversation-fsm.ts`: transições válidas e inválidas (§5.9).
- `sensitive-data.ts`: mascaramento + falsos positivos.
- **Pronto quando:** casos da §13.1 cobertos (ex.: sexta 17h + 4h úteis = segunda 11h).

### T2 Auth, seed e login (F2)
Depende de: T0.
- Convex Auth com credenciais customizadas (qualquer senha para e-mail do seed). Verificar API atual.
- Guards reais: `requireEmployee`, `requireAnalyst`, `requireAgentServer`.
- Redirecionamento por papel (`/chat` × `/console`), sessão persistente, sair.
- Seed idempotente com datas relativas: pessoas, 10 chamados + `ticketUpdates`, 8 artigos, conversa inicial da Mariana (§4).
- Tela de login (§7.1) com contas de demonstração recolhíveis.

### T3 Serviço de chamados + `HttpTicketGateway` (F3)
Depende de: T0 (usa T1 quando entrar; até lá, stub).
- `convex/ticketing/http.ts`: API HTTP autenticada por `TICKETING_SERVICE_KEY`, modo caos (`TICKETING_FAILURE_RATE`, `TICKETING_LATENCY_MS`).
- `service.ts`: create/addUpdate/reopen/markHandoff com idempotência e códigos sequenciais por tipo; `lastActivityAt` só renova com atividade do suporte.
- `queries.ts`: leituras reativas com guard de dono; "não encontrado" idêntico para inexistente e alheio.
- `HttpTicketGateway`: retry 300/900/2000 ms com jitter, timeout, erros tipados, vinculado ao `employeeId`.
- **Testes:** retry com falha simulada, idempotência, timeout; guard com `convex-test`.

### T4 Central de ajuda
Depende de: T0. Pequena; pode ir junto com T3 ou T2.
- Índice de busca textual em `articles`, `KnowledgeGateway`, formato de `conditions`.

### T5 Chat core em tempo real, com agent de eco (F4)
Depende de: T0 (guards stub até T2).
- Mutations: `sendUserMessage` (FSM, limite de 30, `agentBusy`, máscara), `appendDelta`/`finalize` com `requireAgentServer`.
- Job agendado que libera turno travado após 60 s.
- Rotas `POST /api/conversations` e `POST /api/conversations/:id/messages` (202 + `after()`), autenticando como o usuário.
- Agent falso que faz eco em streaming (lotes de ~150 ms), para provar o mecanismo.
- Tela do chat: cabeçalho com estado da conversa, histórico, área de mensagens, campo com os 5 estados (§7.2), contador 20+/30, skeleton/vazio/erro, sugestões iniciais (§11.4).

### T6 Spike Mastra + escolha do LLM
Depende de: nada (pode começar junto com T0). **Maior risco técnico.**
- Confirmar na doc atual: saída estruturada, tools com contexto por requisição, streaming de texto, leitura de tokens/uso.
- `src/agent/llm/models.ts`: resolve provedor e modelos fast/main por env (`groq` no `LLM_PROVIDER`, `GROQ_API_KEY` no `.env.example`).
- Provedor decidido: Groq. Comparar os modelos candidatos (custo/turno, latência, PT-BR, tool calling, saída estruturada strict) e gerar uma nota curta de decisão que vai pro README.
- Conferir limites de taxa (RPM/TPM) do plano, porque o runner de evals dispara muitos turnos seguidos.
- Confirmar o Whisper do Groq para `/api/transcribe` (T15).

### T7 Blocos de mensagem (só apresentação, com fixtures)
Depende de: T0 + protótipo (Anexo C).
- Chips de ação + "Ver detalhes", texto com indicador de digitação, card de artigo, card de chamado com selo de SLA, seletor, card de rascunho (visual + edição inline + estado final), opções rápidas (desabilitam após uso), banner de transferência (fora do horário), eventos, mensagem do analista, erro com "Tentar de novo".
- Uma página interna de fixtures para ver todos os estados.

### T8 Painel de decisão (F8, só apresentação)
Depende de: T0 (`DecisionRecord`).
- 7 seções na ordem da §7.3, linguagem simples, "ver JSON". Reutilizável no console.

### T9 Políticas de decisão
Depende de: T0, T1.
- `OutOfScope`, `ExplicitHandoff`, `Critical`, `OverdueTicket`, `LowConfidence` + runner em cadeia que registra todas (inclusive "não se aplica").
- Teste de cada uma com contexto mínimo.

### T14a Cenários de eval (só escrita)
Depende de: T0.
- `src/agent/evals/scenarios.ts` com os 13 cenários da §13.2 e as expectativas sobre `DecisionRecord` e estado final.

---

## Onda 2: integração

### T10 Pipeline do agent (F5)
Depende de: T3, T4, T5, T6, T9.
- `context-loader` (12 mensagens + `rollingSummary` + estado + rascunho + chamado em foco).
- ENTENDER (modelo rápido, uma retentativa com lembrete do schema), níveis de confiança e `clarificationAttempts`.
- DECIDIR (T9) com curto-circuito.
- AGIR: agent Mastra por requisição, `createTools(sessionContext)`, `withTrace`, prompt de sistema (§6.4), streaming real no lugar do eco.
- REGISTRAR: `DecisionRecord` com uso e custo; resumo acumulado a cada 10 mensagens; contexto de retorno após 12h.
- Pode ser dividido: **T10a** tools + `withTrace` (precisa T3/T4), **T10b** understand + prompts (precisa T6), **T10c** `run-turn` amarrando tudo.

### T11 Rascunho fora do LLM (F6)
Depende de: T3, T5, T7.
- Rotas confirm / cancel / PATCH (recalcula prioridade) / retry.
- Idempotência pelo id da `pendingAction`, card do chamado criado com prazo, transferência automática no caso crítico.
- Ligar os blocos de T7 ao chat real.

### T12 Console do analista (F7)
Depende de: T2, T5, T7, T8.
- Fila com filtros (estado, motivo), ordenação (críticas, depois espera), tempo real com destaque e contador.
- Conversa: card de resumo fixo, histórico com painel de decisão, "Agent pausado", Assumir, mensagens do analista, Devolver com nota, Encerrar, modo leitura para outros analistas.
- Painel do funcionário: dados, chamados com vencidos no topo, detalhe e histórico.

### T15 Voz (faixa 1)
Depende de: T5 (campo de mensagem).
- Gravação até 60 s, `/api/transcribe`, texto editável antes de enviar, estados de erro, "ouvir resposta" com `speechSynthesis`.

---

## Onda 3: fechamento

- **T14b Runner de evals:** roda os cenários contra o modelo real e imprime tabela + custo total. Depende de T10/T11.
- **T16 Limites e custo:** tabela `usage`, conversas por dia (rate limiter), teto diário `MAX_DAILY_LLM_COST_USD`, limite de transcrição.
- **T17 Faixa 2 (se houver tempo):** métricas (§7.6), notificações (§11.6), anexo de print com visão.
- **T18 README + deploy:** estrutura da §14, Vercel + Convex prod.
- **T19 QA ponta a ponta:** persistência após reinício, privacidade, os aceites de F1–F6 e casos de borda (§8).

---

## Mapa de dependências (resumo)

| Task | Depende de | Pode rodar junto com |
|---|---|---|
| T1 domínio | T0 | T2–T9 |
| T2 auth/seed | T0 | T1, T3–T9 |
| T3 ticketing | T0 (T1 no merge) | T1, T2, T4–T9 |
| T4 artigos | T0 | todas da onda 1 |
| T5 chat core | T0 | todas da onda 1 |
| T6 spike LLM | — | tudo |
| T7 blocos | T0 + protótipo | todas da onda 1 |
| T8 painel | T0 | todas da onda 1 |
| T9 políticas | T0, T1 | T2–T8 |
| T10 pipeline | T3, T4, T5, T6, T9 | T11, T12, T15 |
| T11 rascunho | T3, T5, T7 | T10, T12, T15 |
| T12 console | T2, T5, T7, T8 | T10, T11, T15 |
