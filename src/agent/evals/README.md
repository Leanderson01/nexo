# Evals do agent

Cenários que dizem, como dados, o que o agent precisa fazer em cada situação da §13.2 da spec.
O runner (T14b) executa os cenários contra o modelo real e usa `checkScenario` para comparar.

| Arquivo             | O que tem                                                                      |
| ------------------- | ------------------------------------------------------------------------------ |
| `scenario.ts`       | O formato: cenário, passos, expectativas e o que o runner observa              |
| `scenarios.ts`      | Os 13 cenários da tabela (`source: "spec"`) e os extras (`source: "extra"`)    |
| `check-scenario.ts` | `checkScenario(scenario, observed)`: lista de falhas em português (vazia = ok) |

## Como ler um cenário

```ts
{
  id: "mariana-reabre-sap",
  employeeEmail: "mariana.costa@nexo.com.br",   // quem está logado (e-mail do seed)
  tickets: { ofEmployee: ["INC-20150"], ofOthers: [] },  // chamados do seed citados, por dono
  steps: [
    say("Minha senha do SAP bloqueou de novo...", { outcome: "draft_proposed", ... }),
  ],
  final: { proposedAction: { kind: "reopen_ticket", code: "INC-20150", status: "pending" } },
}
```

- **Passos** (`steps`), em ordem: `say(texto)` é uma mensagem digitada; `pick(rótulo)` é o clique
  numa opção rápida (o chat envia o rótulo, e o verificador confere que a resposta anterior a
  ofereceu); `confirmDraft()` e `cancelDraft()` são os botões do card de rascunho, sem LLM.
- **`setup.env`**: variáveis do modo caos do serviço de chamados só para aquele cenário (o do legado
  fora do ar usa `TICKETING_FAILURE_RATE=1`).
- Todo cenário começa numa **conversa nova** (a do seed é do Pedro e está com analista, decisão 1).
- As mensagens já trazem impacto, bloqueio e urgência quando o fluxo precisaria deles. Perguntar de
  novo o que já foi dito é falha de condução (F4), não flexibilidade.

## O que cada expectativa significa

Campo ausente não é verificado. Onde a expectativa aceita uma lista (`outcome`, `intent`), qualquer
valor dela serve.

**Por turno** (`TurnExpectation`, no `DecisionRecord` do turno e na resposta):

| Campo                                        | Verdadeiro quando                                                                                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outcome`, `intent`, `confidenceLevel`       | `outcome`, `understanding.intent` e `confidence.level` batem                                                                                                |
| `policiesTriggered` / `policiesNotTriggered` | a política aparece (ou não) com `outcome: "triggered"` em `policies`                                                                                        |
| `toolsCalled`                                | há uma ação com a tool, e `status`/`attempts` batem quando informados                                                                                       |
| `toolsForbidden`                             | nenhuma ação usa aquela tool                                                                                                                                |
| `noToolCalls`                                | `actions` está vazio (curto-circuito: transferência, fora de escopo)                                                                                        |
| `priority`                                   | `derived.priority.value` é aquela prioridade                                                                                                                |
| `parts.mustInclude` / `mustNotInclude`       | a resposta tem (ou não) o card de artigo X, o card do chamado Y, rascunho, opções rápidas com um rótulo, banner de transferência, erro com "Tentar de novo" |
| `text.mustMatch` / `mustNotMatch`            | cada regra casa (ou não) com o texto da resposta; a `description` da regra é a frase da falha                                                               |
| `mustNotExpose`                              | os códigos não aparecem no texto, nas partes nem no `outputSummary` de nenhuma tool                                                                         |

**No fim** (`FinalStateExpectation`):

| Campo                    | Verdadeiro quando                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversationStatus`     | a conversa terminou nesse estado da FSM                                                                                                         |
| `handoffReason`          | a conversa foi transferida com esse motivo; `null` = não foi transferida                                                                        |
| `proposedAction`         | o último rascunho proposto tem esse tipo, status, código ou campos (categoria, prioridade, `reopenedFrom`, descrição); `null` = nenhum rascunho |
| `ticketsCreated`         | a lista dos chamados criados no cenário bate, em quantidade exata; `[]` = nenhum                                                                |
| `storedDataMustNotMatch` | nenhuma mensagem nem `DecisionRecord` gravado casa com a regra (senha colada)                                                                   |

## O que a T14b precisa implementar

1. **Antes de cada cenário:** rodar o seed de novo (os cenários contam com o estado inicial dos
   chamados do seed), aplicar `setup.env` no deployment do Convex (`npx convex env set`) e desfazer
   depois. O seed hoje **não apaga** chamados criados fora dele: o crítico cria um INC para o Rafael
   que entraria no `findSimilar` dos cenários seguintes dele. O runner precisa apagar esses chamados
   (ou o seed ganhar essa limpeza) e, para `ticketsCreated`, comparar os códigos antes e depois.
2. **Executar os passos** como o próprio funcionário: entrar com o e-mail, criar a conversa
   (`POST /api/conversations`), enviar cada mensagem (`POST .../messages`) e esperar a mensagem do
   assistente sair de `streaming`. Os botões viram `POST .../pending-action/confirm` e `.../cancel`.
   Esperar e repetir no 429 do Groq (decisão 17).
3. **Observar cada passo** (`ObservedStep`): a mensagem do assistente criada pelo passo (`text` =
   partes `text` concatenadas, `parts` = todas as partes) e o `DecisionRecord` ligado a ela pelo
   `decisionId` (ou pelo índice `by_message` de `decisions`). Botões: `decision: null` e, como
   resposta, a mensagem que a rota gravar (ou `null`).
4. **Observar o fim** (`ObservedFinalState`): `status` e `handoff.reason` da conversa; a linha mais
   recente de `pendingActions` da conversa (`action` e `status`); os chamados do funcionário que não
   existiam antes do cenário; e `storedTexts` com o texto de todas as mensagens e os
   `DecisionRecord`s da conversa em JSON.
5. Chamar `checkScenario(scenario, observed)` e imprimir a tabela (id, título, aprovado, falhas) com
   o custo total somando `usage.estimatedCostUsd` dos `DecisionRecord`s.

**Nomes que precisam bater:** `policies[].name` com `POLICY_NAMES` (T9) e `actions[].tool` com
`TOOL_NAMES` (T10), ambos em `scenario.ts`.
