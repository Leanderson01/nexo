import type {
  ConfidenceLevel,
  ConsoleTab,
  ConversationStatus,
  HandoffReason,
  Impact,
  MetricsPeriod,
  OutOfScopeArea,
  Priority,
  ReplyCorrectionRule,
  TicketCategory,
  TicketKind,
  TicketStatus,
} from "./enums";

// Rótulos em português para a interface. `Record<Enum, string>` obriga a cobrir
// todo valor novo que entrar em enums.ts.

export const TICKET_KIND_LABELS: Record<TicketKind, string> = {
  INC: "Incidente",
  REQ: "Requisição",
};

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  access: "Acesso",
  network_vpn: "Rede e VPN",
  hardware: "Hardware",
  software: "Software",
  email: "E-mail",
  other: "Outros",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  CRITICAL: "Crítica",
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Aberto",
  in_progress: "Em andamento",
  awaiting_analyst: "Aguardando analista",
  awaiting_employee: "Aguardando você",
  approved: "Aprovado",
  resolved: "Resolvido",
  closed: "Fechado",
};

export const IMPACT_LABELS: Record<Impact, string> = {
  individual: "Somente você",
  team: "Sua equipe",
  company: "A empresa toda",
};

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  agent: "Nexo Assist",
  waiting_analyst: "Aguardando analista",
  with_analyst: "Com analista",
  closed: "Conversa encerrada",
};

export const HANDOFF_REASON_LABELS: Record<HandoffReason, string> = {
  requested: "Pedido do funcionário",
  critical: "Caso crítico",
  overdue: "Chamado vencido",
  low_confidence: "Agent pediu ajuda",
};

export const OUT_OF_SCOPE_AREA_LABELS: Record<OutOfScopeArea, string> = {
  hr: "RH",
  finance: "Financeiro",
  facilities: "Facilities",
};

export const CONFIDENCE_LEVEL_LABELS: Record<ConfidenceLevel, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

export const CONSOLE_TAB_LABELS: Record<ConsoleTab, string> = {
  all: "Todas",
  for_you: "Para você",
  with_agent: "Com o agent",
  mine: "Minhas",
  closed: "Encerradas",
};

export const METRICS_PERIOD_LABELS: Record<MetricsPeriod, string> = {
  today: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
};

/** O que cada correção em código (decisão 27) consertou, em poucas palavras. */
export const REPLY_CORRECTION_RULE_LABELS: Record<ReplyCorrectionRule, string> = {
  foreign_ticket_code: "Código de chamado alheio removido",
  draft_claim_without_draft: "Disse que preparou rascunho sem preparar",
  critical_without_draft: "Caso crítico sem rascunho",
  no_ticket_found_offer: "Oferta de abrir chamado quando não achou",
  tool_call_as_text: "Chamada de tool escrita como texto removida",
};
