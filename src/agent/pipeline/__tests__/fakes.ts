import type { ArticleMatch, KnowledgeGateway } from "@/agent/gateways/knowledge-gateway";
import type { GatewayError } from "@/agent/gateways/gateway-error";
import type { TicketGateway } from "@/agent/gateways/ticket-gateway";
import type { Handoff } from "@/domain/conversation";
import type { DecisionRecord } from "@/domain/decision-record";
import type { MessagePart } from "@/domain/message-parts";
import type { PendingAction } from "@/domain/pending-action";
import { err, ok, type Result } from "@/domain/result";
import type { TicketDetail, TicketSummary } from "@/domain/ticket";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { AgentStore, HistoryMessage, TurnSnapshot, TurnStatePatch } from "../agent-store";
import type { AgentMessageSink } from "../streaming-message";

// Dublês sem rede para os testes do pipeline e das tools: serviço de chamados, central de
// ajuda, estado da conversa no Convex e a mensagem em streaming.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Quarta-feira, 28/10/2026, 15h em São Paulo: dentro do horário útil. */
export const NOW = Date.UTC(2026, 9, 28, 18, 0);

const UNAVAILABLE: GatewayError = { kind: "unavailable", message: "instável" };
const NOT_FOUND: GatewayError = {
  kind: "not_found",
  message: "Chamado não encontrado entre os seus.",
};

export function detailOf(summary: TicketSummary, extra: Partial<TicketDetail> = {}): TicketDetail {
  return {
    ...summary,
    priorityReason: "Atrapalha, mas há alternativa",
    prioritySignals: { impact: "individual", blocked: false, deadlineToday: false },
    description: `Descrição de ${summary.title}`,
    affected: "Mariana Costa",
    updates: [],
    ...extra,
  };
}

export const NOTEBOOK: TicketDetail = detailOf({
  code: "INC-20311",
  kind: "INC",
  category: "hardware",
  priority: "MEDIUM",
  status: "awaiting_analyst",
  title: "Notebook lento após atualização do Windows",
  createdAt: NOW - 8 * DAY_MS,
  lastActivityAt: NOW - 6 * DAY_MS,
});

export const SAP: TicketDetail = detailOf({
  code: "INC-20150",
  kind: "INC",
  category: "access",
  priority: "MEDIUM",
  status: "resolved",
  title: "Senha do SAP bloqueada",
  createdAt: NOW - 9 * DAY_MS,
  lastActivityAt: NOW - 4 * DAY_MS,
  resolvedAt: NOW - 4 * DAY_MS,
});

export const WIFI: TicketDetail = detailOf({
  code: "INC-20077",
  kind: "INC",
  category: "network_vpn",
  priority: "MEDIUM",
  status: "resolved",
  title: "Wi-Fi caindo na sala de reunião 3",
  createdAt: NOW - 14 * DAY_MS,
  lastActivityAt: NOW - 10 * DAY_MS,
  resolvedAt: NOW - 10 * DAY_MS,
});

export const VPN_ARTICLE: ArticleMatch = {
  slug: "vpn-erro-809",
  title: "VPN com erro 809",
  body: "1. Reinstale o cliente da VPN. 2. Reinicie o computador.",
  tags: ["vpn"],
  conditions: [{ field: "os", appliesTo: ["Windows 10"] }],
  excerpt: "Reinstale o cliente da VPN.",
};

export interface FakeTicketGatewayOptions {
  tickets?: TicketDetail[];
  /** `findSimilar` devolve estes; padrão: nenhum. */
  similar?: TicketSummary[];
  /** Legado fora do ar: toda chamada falha depois de 3 tentativas. */
  down?: boolean;
}

/** Serviço de chamados em memória que relata as tentativas como o HttpTicketGateway. */
export class FakeTicketGateway {
  readonly calls: string[] = [];
  readonly handoffs: { code: string | null; conversationId: string }[] = [];

  constructor(private readonly options: FakeTicketGatewayOptions = {}) {}

  forCall(onAttempt: (attempt: { ok: boolean; errorKind?: GatewayError["kind"] }) => void) {
    const respond = <T>(method: string, value: () => Result<T, GatewayError>) => {
      this.calls.push(method);
      if (this.options.down) {
        for (let attempt = 0; attempt < 3; attempt++) {
          onAttempt({ ok: false, errorKind: "unavailable" });
        }
        return Promise.resolve(err(UNAVAILABLE));
      }
      const result = value();
      onAttempt(result.ok ? { ok: true } : { ok: false, errorKind: result.error.kind });
      return Promise.resolve(result);
    };
    const tickets = this.options.tickets ?? [];
    const gateway: TicketGateway = {
      listMine: () => respond("listMine", () => ok(tickets.map(toSummary))),
      getMine: (code) =>
        respond("getMine", () => {
          const found = tickets.find((ticket) => ticket.code === code);
          return found ? ok(found) : err(NOT_FOUND);
        }),
      findSimilar: () => respond("findSimilar", () => ok(this.options.similar ?? [])),
      create: () => respond("create", () => err(UNAVAILABLE)),
      addUpdate: () => respond("addUpdate", () => err(UNAVAILABLE)),
      reopen: () => respond("reopen", () => err(UNAVAILABLE)),
      markHandoff: (code, conversationId) =>
        respond("markHandoff", () => {
          this.handoffs.push({ code, conversationId });
          return ok(undefined);
        }),
    };
    return gateway;
  }
}

function toSummary(ticket: TicketDetail): TicketSummary {
  const { code, kind, category, priority, status, title, createdAt, lastActivityAt, resolvedAt } =
    ticket;
  return {
    code,
    kind,
    category,
    priority,
    status,
    title,
    createdAt,
    lastActivityAt,
    ...(resolvedAt !== undefined && { resolvedAt }),
  };
}

export function fakeKnowledge(articles: ArticleMatch[] = []): KnowledgeGateway {
  return { search: async () => ok(articles) };
}

export function userMessage(text: string, createdAt = NOW): HistoryMessage {
  return { role: "user", parts: [{ type: "text", text }], createdAt, authorName: null };
}

export function assistantMessage(parts: MessagePart[], createdAt = NOW): HistoryMessage {
  return { role: "assistant", parts, createdAt, authorName: null };
}

export function makeSnapshot(overrides: Partial<TurnSnapshot> = {}): TurnSnapshot {
  return {
    conversation: {
      status: "agent",
      clarificationAttempts: 0,
      selectedTicketCode: null,
      rollingSummary: null,
      returnNote: null,
      pendingHandoffOffer: null,
      ...overrides.conversation,
    },
    pendingDraft: null,
    employee: { id: "people_mariana", name: "Mariana Costa", department: "Financeiro" },
    recentMessages: [userMessage("oi")],
    messagesToSummarize: [],
    messageCount: 1,
    ...overrides,
  };
}

/** O Convex em memória: guarda rascunhos, estado, decisões e transferências. */
export class InMemoryAgentStore implements AgentStore {
  readonly drafts: { id: string; action: PendingAction; handoffOnConfirm: boolean }[] = [];
  readonly statePatches: TurnStatePatch[] = [];
  readonly decisions: DecisionRecord[] = [];
  readonly transfers: Omit<Handoff, "at">[] = [];
  private nextDraftNumber = 381;

  constructor(private readonly snapshot: TurnSnapshot | null = makeSnapshot()) {}

  async loadTurnContext() {
    return this.snapshot;
  }

  async createDraft(action: PendingAction, handoffOnConfirm: boolean) {
    const id = `draft_${this.drafts.length + 1}`;
    this.drafts.push({ id, action, handoffOnConfirm });
    return { pendingActionId: id, draftNumber: this.nextDraftNumber++ };
  }

  async saveTurnState(patch: TurnStatePatch) {
    this.statePatches.push(patch);
  }

  async recordDecision(record: DecisionRecord) {
    this.decisions.push(record);
    return `decision_${this.decisions.length}` as Id<"decisions">;
  }

  async transfer(handoff: Omit<Handoff, "at">) {
    this.transfers.push(handoff);
    return ok(null);
  }
}

/** A mensagem do assistente em memória: o texto em lotes e as partes do fim. */
export class RecordingSink implements AgentMessageSink {
  text = "";
  finalParts: MessagePart[] | null = null;
  decisionId: string | undefined;
  failure: { message: string; retryable: boolean } | null = null;

  async appendDelta(delta: string) {
    this.text += delta;
    return true;
  }

  async finalize(parts: MessagePart[], decisionId?: Id<"decisions">) {
    this.finalParts = parts;
    this.decisionId = decisionId;
    return true;
  }

  async fail(message: string, retryable: boolean) {
    this.failure = { message, retryable };
    return true;
  }
}
