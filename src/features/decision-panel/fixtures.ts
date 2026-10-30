// Caminho relativo (não `@/`): os testes de `convex/` também importam este arquivo.
import type { DecisionRecord, PolicyEvaluation } from "../../domain/decision-record";

// Registros de decisão falsos, tirados dos cenários da spec (§4, §8). Servem à página
// /dev/painel, aos testes do painel e podem ser reaproveitados pelo console (T12) e pelos
// cenários de eval (T14a). Datas fixas para a página não depender da hora em que abre.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Quinta-feira, 29/10/2026, 14:20 em São Paulo. */
const BASE_TIME = Date.UTC(2026, 9, 29, 17, 20);

const FAST_MODEL = "openai/gpt-oss-20b";
const MAIN_MODEL = "openai/gpt-oss-120b";

/** Nomes das políticas na ordem da §6.3; a T9 define os definitivos. */
export const POLICY_NAMES = {
  outOfScope: "Fora de escopo",
  explicitHandoff: "Pedido de analista",
  critical: "Caso crítico",
  overdue: "Chamado vencido",
  lowConfidence: "Baixa confiança",
} as const;

type PolicyKey = keyof typeof POLICY_NAMES;

/** Todas as políticas em ordem; só a indicada dispara, com a explicação dada. */
function policiesWith(triggered?: { key: PolicyKey; explanation: string }): PolicyEvaluation[] {
  return (Object.keys(POLICY_NAMES) as PolicyKey[]).map((key) =>
    key === triggered?.key
      ? { name: POLICY_NAMES[key], outcome: "triggered", explanation: triggered.explanation }
      : { name: POLICY_NAMES[key], outcome: "not_applicable" },
  );
}

/** (a) Mariana pergunta do notebook: INC-20311 vencido e oferta de analista (F2). */
export const overdueTicketDecision: DecisionRecord = {
  understanding: {
    intent: "ticket_status",
    summary: "Quer saber como está o chamado do notebook lento.",
    entities: {
      system: null,
      errorCode: null,
      os: null,
      device: "Notebook",
      ticketRef: "o do notebook",
    },
    signals: {
      kind: null,
      category: "hardware",
      impact: null,
      blocked: null,
      deadlineToday: null,
    },
  },
  policies: policiesWith({
    key: "overdue",
    explanation:
      "INC-20311 sem atualização há 6 dias; prazo da prioridade Média é de 3 dias úteis.",
  }),
  actions: [
    {
      tool: "listMyTickets",
      label: "consultou seus chamados",
      inputSummary: "Chamados abertos da Mariana",
      outputSummary: "2 chamados abertos: INC-20311 e REQ-10442",
      status: "ok",
      attempts: 1,
      latencyMs: 412,
    },
    {
      tool: "getMyTicket",
      label: "consultou o INC-20311",
      inputSummary: "INC-20311",
      outputSummary:
        "Aguardando analista, prioridade Média, última atualização há 6 dias (vencido)",
      status: "ok",
      attempts: 2,
      latencyMs: 1260,
    },
    {
      tool: "offerQuickReplies",
      label: "ofereceu opções",
      inputSummary: "3 opções",
      outputSummary: "Falar com um analista · Adicionar informação · Não, obrigado",
      status: "ok",
      attempts: 1,
      latencyMs: 3,
    },
  ],
  confidence: {
    value: 0.92,
    level: "high",
    reason: "O pedido é claro e só um chamado aberto combina com “notebook”.",
  },
  rationale:
    "A Mariana perguntou do chamado do notebook, e só o INC-20311 combina. Ele está vencido: a última atualização foi há 6 dias e o prazo da prioridade Média é de 3 dias úteis. Por isso expliquei o atraso e ofereci chamar um analista, sem transferir antes de ela escolher.",
  outcome: "answered",
  usage: {
    models: [FAST_MODEL, MAIN_MODEL],
    inputTokens: 3420,
    outputTokens: 286,
    estimatedCostUsd: 0.00057,
    latencyMs: 2140,
  },
  createdAt: BASE_TIME,
};

/** (b) "O sistema de vendas caiu para o time todo": prioridade Crítica e rascunho (F4). */
export const criticalDraftDecision: DecisionRecord = {
  understanding: {
    intent: "open_ticket",
    summary:
      "Quer abrir chamado: o sistema de vendas está fora do ar para o time comercial inteiro.",
    entities: {
      system: "Sistema de vendas",
      errorCode: null,
      os: null,
      device: null,
      ticketRef: null,
    },
    signals: {
      kind: "INC",
      category: "software",
      impact: "team",
      blocked: true,
      deadlineToday: null,
    },
  },
  policies: policiesWith({
    key: "critical",
    explanation:
      "Sistema de vendas parado para a equipe toda: prioridade Crítica. O rascunho sai com essa prioridade e, ao confirmar, a conversa vai direto para um analista.",
  }),
  actions: [
    {
      tool: "findSimilarTickets",
      label: "procurou chamados parecidos",
      inputSummary: "“sistema de vendas fora do ar”, categoria Software",
      outputSummary: "Nenhum chamado parecido aberto ou resolvido nos últimos 30 dias",
      status: "ok",
      attempts: 1,
      latencyMs: 518,
    },
    {
      tool: "proposeTicketDraft",
      label: "classificou a prioridade",
      inputSummary: "Incidente, Software, impacto na equipe, impedidos de trabalhar",
      outputSummary: "Rascunho D-381 com prioridade Crítica",
      status: "ok",
      attempts: 1,
      latencyMs: 64,
    },
  ],
  derived: {
    priority: {
      value: "CRITICAL",
      reason: "Parado para uma equipe/empresa",
      dueAt: BASE_TIME + 3 * MINUTE_MS + HOUR_MS,
    },
  },
  confidence: {
    value: 0.88,
    level: "high",
    reason: "Sistema, impacto e bloqueio ficaram claros na mensagem.",
  },
  rationale:
    "O sistema de vendas parou para o time inteiro, sem alternativa: isso é prioridade Crítica, com prazo de 1 hora corrida. Antes de propor, conferi que não havia chamado parecido. O rascunho espera a confirmação; ao confirmar, a conversa vai para um analista.",
  outcome: "draft_proposed",
  usage: {
    models: [FAST_MODEL, MAIN_MODEL],
    inputTokens: 4180,
    outputTokens: 412,
    estimatedCostUsd: 0.00078,
    latencyMs: 3480,
  },
  createdAt: BASE_TIME + 3 * MINUTE_MS,
};

/** (c) "Quero falar com uma pessoa": transfere na hora, sem o modelo principal (F5). */
export const explicitHandoffDecision: DecisionRecord = {
  understanding: {
    intent: "talk_to_analyst",
    summary: "Pediu para falar com uma pessoa do suporte.",
    entities: {
      system: null,
      errorCode: null,
      os: null,
      device: null,
      ticketRef: null,
    },
    signals: {
      kind: null,
      category: null,
      impact: null,
      blocked: null,
      deadlineToday: null,
    },
  },
  policies: policiesWith({
    key: "explicitHandoff",
    explanation:
      "Pedido explícito para falar com uma pessoa: transfere sem tentar convencer a ficar. O modelo principal não foi chamado.",
  }),
  actions: [
    {
      tool: "requestHandoff",
      label: "transferiu para um analista",
      inputSummary: "Motivo: pedido do funcionário",
      outputSummary: "Conversa na fila do suporte, com resumo para o analista",
      status: "ok",
      attempts: 1,
      latencyMs: 142,
    },
  ],
  confidence: {
    value: 0.97,
    level: "high",
    reason: "Pedido direto, sem ambiguidade.",
  },
  rationale:
    "O pedido para falar com uma pessoa foi explícito, então a regra transferiu na hora, sem chamar o modelo principal. A conversa entrou na fila do suporte com um resumo para o analista.",
  outcome: "handoff",
  usage: {
    models: [FAST_MODEL],
    inputTokens: 1210,
    outputTokens: 74,
    estimatedCostUsd: 0.00011,
    latencyMs: 690,
  },
  createdAt: BASE_TIME + 10 * MINUTE_MS,
};

/** (d) Legado instável: o serviço de chamados falhou nas 3 tentativas (casos de borda, §8). */
export const unstableLegacyDecision: DecisionRecord = {
  understanding: {
    intent: "ticket_status",
    summary: "Quer saber como está o pedido de acesso ao Figma.",
    entities: {
      system: "Figma",
      errorCode: null,
      os: null,
      device: null,
      ticketRef: "o acesso ao Figma",
    },
    signals: {
      kind: "REQ",
      category: "access",
      impact: null,
      blocked: null,
      deadlineToday: null,
    },
  },
  policies: policiesWith(),
  actions: [
    {
      tool: "listMyTickets",
      label: "consultou seus chamados",
      inputSummary: "Chamados abertos da Juliana",
      outputSummary: "Serviço de chamados indisponível (erro 503 nas 3 tentativas)",
      status: "error",
      attempts: 3,
      latencyMs: 4870,
    },
  ],
  confidence: {
    value: 0.9,
    level: "high",
    reason: "O pedido é claro; o problema foi o serviço de chamados, não o entendimento.",
  },
  rationale:
    "Entendi que a Juliana quer saber do acesso ao Figma, mas o serviço de chamados não respondeu nem depois de 3 tentativas. Em vez de inventar o status, avisei que o sistema está instável e ofereci tentar de novo ou falar com um analista.",
  outcome: "error",
  usage: {
    models: [FAST_MODEL, MAIN_MODEL],
    inputTokens: 2960,
    outputTokens: 158,
    estimatedCostUsd: 0.00043,
    latencyMs: 6120,
  },
  createdAt: BASE_TIME + 20 * MINUTE_MS,
};

/** (e) O modelo não respondeu: o turno parou antes de entender a mensagem (§10). */
export const modelFailureDecision: DecisionRecord = {
  understanding: null,
  policies: [],
  actions: [],
  confidence: null,
  rationale:
    "O modelo de linguagem não respondeu a tempo, nem na nova tentativa. O turno parou antes de entender a mensagem, e o funcionário recebeu um aviso com “Tentar de novo”.",
  outcome: "error",
  usage: {
    models: [FAST_MODEL],
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    latencyMs: 15200,
  },
  createdAt: BASE_TIME + 25 * MINUTE_MS,
};

export interface DecisionFixture {
  id: string;
  title: string;
  record: DecisionRecord;
}

export const DECISION_FIXTURES: DecisionFixture[] = [
  {
    id: "vencido",
    title: "Mariana: chamado do notebook vencido",
    record: overdueTicketDecision,
  },
  {
    id: "critico",
    title: "Sistema de vendas fora do ar para o time",
    record: criticalDraftDecision,
  },
  {
    id: "transferencia",
    title: "“Quero falar com uma pessoa”",
    record: explicitHandoffDecision,
  },
  {
    id: "legado-instavel",
    title: "Legado instável: 3 tentativas e erro",
    record: unstableLegacyDecision,
  },
  {
    id: "falha-do-modelo",
    title: "Modelo fora do ar: turno sem entendimento",
    record: modelFailureDecision,
  },
];
