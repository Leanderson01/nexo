# Nexo Assist: controle de tasks

Arquivo de controle do projeto. Fonte das regras: `nexo-assist-especificacao.md` (fora do git; seções citadas como §N).

## Como usar

- Ao pegar uma task: mude o status para `em andamento` e preencha a branch.
- Ao terminar: `feito`, com o commit ou PR de merge.
- Uma branch por task (`task/T3-ticketing`), rebase em `main` antes do merge para manter o histórico linear.
- Decisões e dúvidas vão na seção "Decisões em aberto", não espalhadas pelo código.

Status: `a fazer` · `em andamento` · `bloqueada` · `feito`

## Quadro

| Task | Descrição                           | Onda | Depende de         | Status  | Branch / commit      |
| ---- | ----------------------------------- | ---- | ------------------ | ------- | -------------------- |
| T0.1 | Repositório e setup                 | 0    | —                  | feito   | `563682f`            |
| T0.2 | Contratos travados                  | 0    | T0.1               | feito   | `1d61b2f`..`75caf37` |
| T1   | Domínio puro + testes               | 1    | T0                 | feito   | `9a67b55`..`3c7e07a` |
| T2   | Auth, seed e login                  | 1    | T0                 | feito   | `e3f4e21`..`64040d5` |
| T3   | Serviço de chamados + gateway       | 1    | T0                 | feito   | `8542296`..`5af370c` |
| T4   | Central de ajuda                    | 1    | T0                 | feito   | `c3b7876`..`3569ce7` |
| T5   | Chat core com agent de eco          | 1    | T0                 | feito   | `e77c42a`..`42105c4` |
| T6   | Teste do Mastra + escolha do LLM    | 1    | —                  | feito   | `4239a66`..`b1f15aa` |
| T7   | Blocos de mensagem                  | 1    | T0                 | feito   | `cc0e824`..`005da74` |
| T8   | Painel de decisão                   | 1    | T0                 | feito   | `71e0cc8`..`c4c6376` |
| T9   | Políticas de decisão                | 1    | T0, T1             | feito   | `fcd7b1f`..`46303d4` |
| T14a | Cenários de eval (escrita)          | 1    | T0                 | feito   | `751f366`..`0fec9aa` |
| T10  | Pipeline do agent                   | 2    | T3, T4, T5, T6, T9 | feito   | `e06954d`..`bfa92dd` |
| T10b | Correções do agent (evals)          | 2    | T10, T14b          | feito   | `2001b22`..`a744703` |
| T11  | Rascunho fora do LLM                | 2    | T3, T5, T7         | feito   | `ba10492`..`325f1be` |
| T12  | Console do analista                 | 2    | T2, T5, T7, T8     | feito   | `d1a56de`..`b266e0b` |
| T15  | Voz                                 | 2    | T5                 | feito   | `1b065c1`..`ac08637` |
| T20  | Tela "Meu perfil" (só no protótipo) | 1    | T2                 | feito   | `472ca97`..`4529600` |
| T14b | Runner de evals                     | 3    | T10, T11           | feito   | `f6f6b07`..`0b2bc11` |
| T16  | Limites e custo                     | 3    | T10                | feito   | `aff9dd0`..`fdef973` |
| T17  | Faixa 2: métricas e notificações    | 3    | T10, T12           | feito   | `1a1617b`..`f58a0d6` |
| T18  | README e deploy                     | 3    | tudo               | a fazer |                      |
| T19a | Acabamento (12 pontos)              | 3    | T10b               | feito   | `0e3566b`..`a94f119` |
| T19  | QA de ponta a ponta                 | 3    | tudo               | a fazer |                      |

## Decisões em aberto

1. ~~**Seed da Mariana em `waiting_analyst`**~~ → **decidido: a conversa inicial do seed é do Pedro**, transferida pelo crítico INC-20420 (motivo `critical`). Desvio da §4.4. Contexto: quem entra como Mariana cai numa conversa com o agent pausado e não consegue testar o chamado vencido.
2. ~~**Chamado vencido × chamado em foco**~~ → **decidido: resolver o chamado em foco em código entre ENTENDER e DECIDIR** (a partir do `ticketRef` e da lista de chamados do funcionário). Contexto: a `OverdueTicketPolicy` roda no DECIDIR, antes do `selectTicket` do AGIR. Proposta: resolver o `ticketRef` em código entre ENTENDER e DECIDIR.
3. ~~**REQ-10442 pode aparecer vencido**~~ → **decidido: última atividade "há 3 dias"** no seed. Contexto: dependendo da hora (Baixa, 50h úteis, atividade há exatos 7 dias, `Aprovado` não pausa o prazo).
4. ~~**Códigos sequenciais**~~ → **decidido:** falta a tabela `counters` no modelo de dados (incluída no T0.2).
5. ~~**Limite de 30**~~ → **decidido: conta só as mensagens do funcionário** (são as que geram custo).
6. ~~**Reabertura renova `lastActivityAt`?**~~ → **decidido: sim**, o prazo recomeça junto com o atendimento.
7. ~~**Protótipo (Anexo C)**~~ → recebido; telas em `docs/prototipo/` e divergências na seção "Protótipo" abaixo.
8. ~~**Provedor de LLM**~~ → **Groq** (única chave disponível). Candidatos a validar no T6: `openai/gpt-oss-20b` (rápido, saída estruturada strict) e `openai/gpt-oss-120b` (principal, tool calling); reserva: Kimi K2 ou Qwen3. Transcrição também pelo Groq (Whisper). Chave paga. Pendente: medir PT-BR e conferir o limite de taxa do plano.
9. **UI com Mantine** (decidido). Conferir a versão atual no T0.1; tema próprio (azul primário, serifada só no título do login, sans no resto).
10. ~~**Seed × protótipo**~~ → **decidido: o seed segue a spec** (pessoas, chamados, cenários e evals). O protótipo vale só como referência visual; os nomes dele não entram no seed. Contexto: no protótipo, Ana Souza é **funcionária** (Financeiro) e dona do INC-20311, e Rafael Lima é **analista N2**. Na spec, Ana Ribeiro é analista N1, Rafael Lima é funcionário e o INC-20311 é da Mariana. O protótipo também mostra chamados que o seed não tem (INC-20298, INC-19877, INC-19410).
11. ~~**Devolver ao agent antes de assumir**~~ → **decidido: liberar `return` também a partir de `waiting_analyst`** (desvio da §5.9, vai no README). Contexto: a tela 5 mostra "Devolver ao agent" em `waiting_analyst`, mas a FSM da spec só permite `return` a partir de `with_analyst`.
12. ~~**Extras que só o protótipo tem**~~ → **decidido conforme a proposta abaixo**; nível ("Suporte N2") e subcategoria são só texto visual, sem regra de negócio. Contexto: busca na fila, presença ("online", "digitando..."), confirmação de leitura (✓✓), contador de não lidas, status "Disponível" do analista, encaminhamento por nível ("Suporte N2"), subcategoria ("Hardware › Notebook"), atalho ⌘↵ no Confirmar, número do rascunho ("D-381"). Proposta: não lidas, busca, ⌘↵ e número do rascunho entram; presença, digitando e leitura ficam na faixa 2.
13. ~~**O que a spec pede e o protótipo não mostra**~~ → **decidido: entra tudo, no estilo do protótipo.** Contexto: histórico de conversas e "Nova conversa" no chat, link "Ver detalhes" nos chips, card de resumo da transferência no console, filtro "Encerradas", contas de demonstração no login. Proposta: incluir tudo no estilo do protótipo.
14. ~~**Números do login**~~ → **decidido: estáticos até o T17.** Contexto: ("8 s", "72%", "6 analistas online"): estáticos ou vindos das métricas? Proposta: estáticos até o T17 e, se ele entrar, reais.
15. ~~**`findSimilar` só até 7 dias × F4**~~ → **decidido:** a §5.6 limita a abertos e resolvidos há até 7 dias, mas o F4 e o eval do Rafael precisam ver o INC-20077 (resolvido há 10 dias). `findSimilar` devolve abertos e resolvidos/fechados **há até 30 dias**; o domínio decide entre atualizar, reabrir e criar novo com referência.
16. ~~**Esperas do retry (300/900/2.000 ms)**~~ → **decidido:** 3 tentativas com esperas de ~300 ms e ~900 ms (±20% de jitter) e **2.000 ms de limite por tentativa**.
17. ~~**Limite de taxa do Groq**~~ → **resolvido (30/10):** a chave paga tem 500.000 req/dia e 250.000 tokens/min, mais de 30 turnos completos por minuto. Não é gargalo; o runner de evals (T14b) ainda espera e repete no 429 por segurança.
18. ~~**Modo estrito × `confidence.min(0).max(1)`**~~ → **resolvido (30/10):** o Groq aceita `minimum`/`maximum` no modo estrito; o ENTENDER fica com `strict: true` no `gpt-oss-20b` (100% de JSON válido e de intenção certa nas 12 frases). Saída inválida do modelo (o 120b gerou uma categoria fora do enum) é tratada pela nova tentativa com lembrete do schema da §10.

19. ~~**Confiança média pergunta para sempre**~~ → **decidido:** depois de 2 esclarecimentos, transfere por `low_confidence` sempre que a confiança não for alta (a §6.2 só citava a baixa; a §8 vale para as duas).
20. ~~**Recusa de injeção dependia do modelo**~~ → **decidido:** o contrato das políticas ganhou a ação decisiva `refuse` (`rule_change` ou `not_it`). "Ignore as regras…" e assunto fora de TI sem área são recusados em código, sem o modelo principal; o turno sai como `redirected`.
21. ~~**Tipo nulo bloqueava o crítico**~~ → **decidido:** Crítica e Alta são derivadas mesmo sem o tipo (INC/REQ), que só separa Média de Baixa; sem o tipo, só não deriva quando o resultado dependeria dele.
22. ~~**Vencido aceito: motivo `overdue` ou `requested`?**~~ → **decidido:** quando o funcionário aceita a oferta de analista feita pela `OverdueTicketPolicy` no turno anterior, a transferência sai com motivo **`overdue`** (§3.3), não `requested`. A T10 lembra da oferta pendente na conversa.
23. ~~**Campos a mais no `DecisionRecord`**~~ → **decidido e já no contrato** (todos opcionais): `PolicyEvaluation.actionKind` (o runner da T9 já grava), `ToolCallTrace.attemptErrors`, `TurnUsage.cachedInputTokens`, `DecisionRecord.shortCircuit` e `DecisionRecord.errorStage`. A T10 preenche os demais e grava o `note` das políticas que não se aplicam em `explanation` (o runner já faz).

24. ~~**Autoria dos commits**~~ → **decidido (30/10):** autor e committer `Leanderson01 <leandersonnunes.alu.lmb@gmail.com>` (fixado na configuração do repo) e **sem** a linha `Co-Authored-By`. O histórico inteiro foi reescrito para isso; os hashes citados aqui já são os novos.
25. ~~**Falhas do agent achadas pelos evals**~~ → **resolvido na T10b (30/10): evals 54/54 em `--repeat 3`** (antes 42/54; US$ 0,052 a rodada). Contexto original (aberta, ver `docs/evals/resultado.md`; 42/54 execuções, 11 de 13 cenários da spec estáveis): (a) "o sistema de folha de ponto caiu para a equipe" vira `out_of_scope` e é recusado em vez de Crítico; (b) chamado alheio por descrição não oferece abrir chamado e, às vezes, o modelo inventa códigos nas opções rápidas; (c) o sinal `blocked` oscila ("não consigo trabalhar sem ela") e a prioridade cai de Alta para Média; (d) às vezes o texto diz que preparou um card sem chamar a tool. Propostas: ajustar o prompt do ENTENDER (sistema fora do ar é TI; exemplos de `blocked`), validar em código depois do AGIR (todo código citado precisa ser do funcionário; "rascunho/card" no texto exige a parte `draft`) e oferecer "abrir chamado" fixo em código quando não há chamado.

26. ~~**Ordem do fechamento**~~ → **decidido (30/10):** o deploy (parte da T18) fica para depois. Primeiro termina todo o código (T10b, acabamento e o que entrar da T17); depois o usuário e o Claude revisam **todas as telas juntos**; só então README final e deploy.

27. ~~**Correções em código na resposta do AGIR**~~ → **decidido (T10b):** o `DecisionRecord` ganhou o campo opcional `corrections` (`{ rule, explanation }`, regras em `REPLY_CORRECTION_RULES`) e a `messages.finalize` aceita `text` para trocar o texto transmitido pela versão corrigida. Conferências em `src/agent/pipeline/reply-checks.ts`: código de chamado alheio é removido; "preparei/confira o card" sem card ganha até 2 novas tentativas do AGIR e, falhando, vira aviso honesto. Efeito visível: o texto pode trocar no fim do streaming. Riscos conhecidos: o modelo às vezes parafraseia o artigo sem "Isso resolveu?" e uma vez escreveu `offerQuickReplies({...})` como texto (anotado para o acabamento).

28. ~~**Fidelidade visual aos prints**~~ → **decidido (30/10):** antes da revisão das telas com o usuário, uma validação visual contra `docs/prototipo/`: primeiro a **fundação** (fontes, tamanhos, pesos, cores, raios, sombras, espaçamentos e ícones extraídos dos prints, aplicados no tema e nos estilos compartilhados) e depois **três agents em paralelo** (login + perfil; chat; console), cada um comparando captura × print nas mesmas dimensões e corrigindo até ficar igual. Onde o print diverge de uma decisão já tomada (ex.: presença "online", "há 42 dias"), mantém-se a decisão e iguala-se só o visual.
29. **Números do login** (aberta, decisão 14): a T17 entrou, mas a proposta é mantê-los estáticos, porque num ambiente de demonstração os números reais seriam pequenos ou zero. Confirmar na revisão das telas.

## Desvios da spec feitos no T0

Valem para todas as tasks; entram no README (T18).

- **Valores de enum em inglês, rótulos em português** (`src/domain/labels.ts`). Ex.: categoria `network_vpn` → "Rede e VPN", status `awaiting_employee` → "Aguardando você".
- **Tabela `pendingActions`** no lugar do `pendingAction` embutido na conversa: o card de rascunho precisa mostrar o estado final depois de confirmado ou cancelado. A conversa guarda só `pendingActionId`; o `_id` da linha é a chave de idempotência.
- **`prioritySignals` guardado no chamado**, para recalcular a prioridade quando uma atualização muda a gravidade (F3).
- **`searchText` em `articles`**: o índice de busca do Convex aceita um campo só, então título, corpo e tags vão concatenados **já normalizados** (minúsculas, sem acento, sem palavras vazias, com corte simples de terminação; ver `convex/knowledge/searchTerms.ts`).
- **`employeeMessageCount`** no lugar de `messageCount` (decisão 5) e **`returnNote`** para a nota do analista ao devolver.
- **Variável `NEXT_PUBLIC_CONVEX_SITE_URL`** (nome que o `npx convex dev` gera) no lugar de `CONVEX_SITE_URL`.

## Regras para as tasks paralelas

- **Antes de retomar T3, T5 ou T6, leia `docs/desenho-onda-1.md`**: o desenho já foi fechado lá.
- **Rode o Claude Code a partir deste repo** (`~/workspace/nexo`). Uma sessão aberta em outro repo não consegue escrever nas worktrees daqui.

- Os contratos do T0.2 estão travados. Uma task pode **acrescentar** campo opcional ou índice às tabelas dela; mudar ou remover algo existente exige registrar aqui antes.
- Tipos novos de domínio vão em `src/domain/`; validators do Convex, em `convex/lib/validators.ts`, sempre com `assertTypesMatch`.
- Convex local sem conta: `CONVEX_AGENT_MODE=anonymous npx convex dev`. **Com várias worktrees ao mesmo tempo, dê portas próprias a cada uma** (`--local-cloud-port 3240 --local-site-port 3241`), senão todas disputam a 3212.
- Primeira vez num deployment novo: `npm run setup:auth` (chaves do Convex Auth) e `npm run seed`.

---

## Protótipo

Telas em `docs/prototipo/`. Elas são a referência visual; quando divergirem da spec em **comportamento**, vale a spec até decidirmos na seção acima.

| Arquivo                    | Tela                                                                                                                        | Tasks       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `01-login.png`             | Login: painel escuro com chat de exemplo e números; formulário com mostrar senha, "Esqueci minha senha", "Manter conectado" | T2          |
| `02-chat-rascunho.png`     | Chat: navegação lateral, chips de ação, opções rápidas, card de rascunho, contador "18/30"                                  | T5, T7, T11 |
| `03-chat-consulta.png`     | Chat: seletor de chamados em lista com status e data, card de chamado vencido, oferta de analista                           | T7, T10     |
| `04-perfil.png`            | Meu perfil: nome, e-mail gerenciado pela TI, redefinir senha                                                                | T20         |
| `05-console-fila.png`      | Console: fila com abas e motivos, conversa aguardando, barra "Assumir atendimento", chamados do funcionário                 | T12         |
| `06-console-atendendo.png` | Console: analista atendendo, eventos de transferência e de assumir, Devolver e Encerrar                                     | T12         |

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
- `conversation-fsm.ts`: transições válidas e inválidas (§5.9), **com `return` permitido também a partir de `waiting_analyst`** (decisão 11).
- `sensitive-data.ts`: mascaramento + falsos positivos.
- **Pronto quando:** casos da §13.1 cobertos (ex.: sexta 17h + 4h úteis = segunda 11h).

### T2 Auth, seed e login (F2)

Depende de: T0.

- Convex Auth com credenciais customizadas (qualquer senha para e-mail do seed). Verificar API atual.
- Guards reais: `requireEmployee`, `requireAnalyst`, `requireAgentServer`.
- Redirecionamento por papel (`/chat` × `/console`), sessão persistente, sair.
- Seed idempotente com datas relativas: pessoas, 10 chamados + `ticketUpdates`, 8 artigos (§4). Ajustes: REQ-10442 com atividade há 3 dias e conversa inicial do **Pedro** pelo INC-20420 (decisões 1 e 3).
- Tela de login (§7.1) com contas de demonstração recolhíveis.

### T3 Serviço de chamados + `HttpTicketGateway` (F3)

Depende de: T0 (usa T1 quando entrar; até lá, stub).

- `convex/ticketing/http.ts`: API HTTP autenticada por `TICKETING_SERVICE_KEY`, modo caos (`TICKETING_FAILURE_RATE`, `TICKETING_LATENCY_MS`).
- `service.ts`: create/addUpdate/reopen/markHandoff com idempotência e códigos sequenciais por tipo; `lastActivityAt` só renova com atividade do suporte e com a reabertura.
- `queries.ts`: leituras reativas com guard de dono; "não encontrado" idêntico para inexistente e alheio.
- `HttpTicketGateway`: retry 300/900/2000 ms com jitter, timeout, erros tipados, vinculado ao `employeeId`.
- **Testes:** retry com falha simulada, idempotência, timeout; guard com `convex-test`.

### T4 Central de ajuda

Depende de: T0. Pequena; pode ir junto com T3 ou T2.

- Índice de busca textual em `articles`, `KnowledgeGateway`, formato de `conditions`.

### T5 Chat core em tempo real, com agent de eco (F4)

Depende de: T0 (guards stub até T2).

- Mutations: `sendUserMessage` (FSM, limite de 30 mensagens do funcionário, `agentBusy`, máscara), `appendDelta`/`finalize` com `requireAgentServer`.
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

- Resolução do chamado em foco em código entre ENTENDER e DECIDIR (decisão 2).
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
- Abas do protótipo (Todas, Para você, Com o agent, Minhas) + filtro "Encerradas" e busca por funcionário/chamado; contador de não lidas.
- Conversa: card de resumo fixo, histórico com painel de decisão, "Agent pausado", Assumir, mensagens do analista, Devolver com nota, Encerrar, modo leitura para outros analistas.
- Painel do funcionário: dados, chamados com vencidos no topo, detalhe e histórico.

### T20 Tela "Meu perfil"

Depende de: T2. Só existe no protótipo (tela 4).

- Nome, e-mail com selo "Gerenciado pela TI", data da última troca de senha e "Redefinir senha" (simulado, só exibe o aviso do link enviado).

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

| Task         | Depende de         | Pode rodar junto com |
| ------------ | ------------------ | -------------------- |
| T1 domínio   | T0                 | T2–T9                |
| T2 auth/seed | T0                 | T1, T3–T9            |
| T3 ticketing | T0 (T1 no merge)   | T1, T2, T4–T9        |
| T4 artigos   | T0                 | todas da onda 1      |
| T5 chat core | T0                 | todas da onda 1      |
| T6 spike LLM | —                  | tudo                 |
| T7 blocos    | T0 + protótipo     | todas da onda 1      |
| T8 painel    | T0                 | todas da onda 1      |
| T9 políticas | T0, T1             | T2–T8                |
| T10 pipeline | T3, T4, T5, T6, T9 | T11, T12, T15        |
| T11 rascunho | T3, T5, T7         | T10, T12, T15        |
| T12 console  | T2, T5, T7, T8     | T10, T11, T15        |
