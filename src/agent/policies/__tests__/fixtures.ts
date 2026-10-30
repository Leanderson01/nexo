import type { TicketSummary } from "@/domain/ticket";
import type { Understanding } from "@/domain/understanding";

import type { TurnContext } from "../policy";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Quarta-feira, 28/10/2026, 15h em São Paulo: dentro do horário útil. */
export const NOW = Date.UTC(2026, 9, 28, 18, 0);

export function makeUnderstanding(overrides: Partial<Understanding> = {}): Understanding {
  return {
    intent: "question",
    summary: "Dúvida sobre a VPN",
    entities: { system: null, errorCode: null, os: null, device: null, ticketRef: null },
    ticketSignals: {
      kind: null,
      category: null,
      impact: null,
      blocked: null,
      deadlineToday: null,
    },
    missingFields: [],
    confidence: 0.9,
    confidenceReason: "Pedido claro.",
    ...overrides,
  };
}

export function makeContext(
  overrides: Omit<Partial<TurnContext>, "understanding"> & {
    understanding?: Partial<Understanding>;
  } = {},
): TurnContext {
  const { understanding, ...rest } = overrides;
  return {
    now: NOW,
    conversationStatus: "agent",
    clarificationAttempts: 0,
    focusedTicket: null,
    derivedPriority: null,
    ...rest,
    understanding: makeUnderstanding(understanding),
  };
}

// Chamados do seed (§4.2), com datas relativas a NOW.

export const MARIANA_NOTEBOOK: TicketSummary = {
  code: "INC-20311",
  kind: "INC",
  category: "hardware",
  priority: "MEDIUM",
  status: "awaiting_analyst",
  title: "Notebook lento após atualização do Windows",
  createdAt: NOW - 8 * DAY_MS,
  lastActivityAt: NOW - 6 * DAY_MS,
};

export const MARIANA_MONITOR: TicketSummary = {
  code: "REQ-10442",
  kind: "REQ",
  category: "hardware",
  priority: "LOW",
  status: "approved",
  title: "Segundo monitor para home office",
  createdAt: NOW - 10 * DAY_MS,
  lastActivityAt: NOW - 3 * DAY_MS,
};

export const MARIANA_SAP: TicketSummary = {
  code: "INC-20150",
  kind: "INC",
  category: "access",
  priority: "MEDIUM",
  status: "resolved",
  title: "Senha do SAP bloqueada",
  createdAt: NOW - 9 * DAY_MS,
  lastActivityAt: NOW - 4 * DAY_MS,
  resolvedAt: NOW - 4 * DAY_MS,
};

export const MARIANA_TICKETS = [MARIANA_NOTEBOOK, MARIANA_MONITOR, MARIANA_SAP];

export const RAFAEL_OUTLOOK: TicketSummary = {
  code: "INC-20402",
  kind: "INC",
  category: "email",
  priority: "HIGH",
  status: "in_progress",
  title: "Outlook não sincroniza no celular",
  createdAt: NOW - 2 * DAY_MS,
  lastActivityAt: NOW - HOUR_MS,
};

export const JULIANA_FIGMA: TicketSummary = {
  code: "REQ-10510",
  kind: "REQ",
  category: "access",
  priority: "LOW",
  status: "awaiting_employee",
  title: "Acesso ao Figma",
  createdAt: NOW - 5 * DAY_MS,
  lastActivityAt: NOW - 20 * DAY_MS,
};
