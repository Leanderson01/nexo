import { v } from "convex/values";

import type { ConversationStatus, PendingActionStatus } from "../src/domain/enums";
import type { PendingAction } from "../src/domain/pending-action";
import { derivePriority } from "../src/domain/priority";
import { err, ok, type Result } from "../src/domain/result";
import { maskSensitiveData } from "../src/domain/sensitive-data";
import type { NewTicket, PrioritySignals } from "../src/domain/ticket";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { findOwnedConversation } from "./conversations";
import { requireAgentServer, requireEmployee } from "./lib/guards";
import { transferToAnalyst } from "./lib/handoff";
import { vPendingAction } from "./lib/validators";

// O rascunho de chamado fora do LLM (§6.5). O agent só propõe (`pendingActions` em `pending`);
// quem efetiva é o funcionário, pelas rotas do Next:
//   confirmar → o Next executa no serviço de chamados e chama `completeConfirm`
//               (ou `recordConfirmFailure`, se o legado não respondeu);
//   cancelar  → `cancel`;  editar → `edit`.
// Leitura e edição rodam como o funcionário (dono da conversa). O que escreve mensagem do
// assistente ou de sistema exige o segredo do servidor (§5.5) e confere o dono de novo.

const TITLE_MAX_LENGTH = 120;
const AFFECTED_MAX_LENGTH = 120;
const TEXT_MAX_LENGTH = 4000;

// ---------- Leituras do funcionário ----------

/** O rascunho com o estado atual; null se não existe ou é de outra pessoa. */
export const get = query({
  args: { pendingActionId: v.string() },
  handler: async (ctx, { pendingActionId }) => {
    const employee = await requireEmployee(ctx);
    const id = ctx.db.normalizeId("pendingActions", pendingActionId);
    const pendingAction = id ? await ctx.db.get(id) : null;
    if (!pendingAction) return null;

    const conversation = await findOwnedConversation(
      ctx,
      employee._id,
      pendingAction.conversationId,
    );
    if (!conversation) return null;

    return {
      id: pendingAction._id as string,
      draftNumber: pendingAction.draftNumber,
      action: pendingAction.action,
      status: pendingAction.status,
      resultTicketCode: pendingAction.resultTicketCode ?? null,
      createdAt: pendingAction.createdAt,
      resolvedAt: pendingAction.resolvedAt ?? null,
    };
  },
});

/** O que as rotas de confirmar e cancelar precisam saber antes de agir. */
export interface OwnedDraft {
  employeeId: Id<"people">;
  conversationId: Id<"conversations">;
  conversationStatus: ConversationStatus;
  agentBusy: boolean;
  pendingActionId: Id<"pendingActions">;
  status: PendingActionStatus;
  action: PendingAction;
  handoffOnConfirm: boolean;
  resultTicketCode: string | null;
}

/** O rascunho da conversa, se os dois forem do funcionário logado. */
export const loadForEmployee = query({
  args: { conversationId: v.string(), pendingActionId: v.string() },
  handler: async (
    ctx,
    { conversationId, pendingActionId },
  ): Promise<Result<OwnedDraft, "not_found">> => {
    const employee = await requireEmployee(ctx);
    const found = await findOwnedDraft(ctx, employee._id, conversationId, pendingActionId);
    if (!found) return err("not_found");

    const { conversation, pendingAction } = found;
    return ok({
      employeeId: employee._id,
      conversationId: conversation._id,
      conversationStatus: conversation.status,
      agentBusy: conversation.agentBusy,
      pendingActionId: pendingAction._id,
      status: pendingAction.status,
      action: pendingAction.action,
      handoffOnConfirm: pendingAction.handoffOnConfirm,
      resultTicketCode: pendingAction.resultTicketCode ?? null,
    });
  },
});

// ---------- Edição inline (funcionário) ----------

export type EditDraftError = "not_found" | "not_pending" | "closed" | "busy" | "invalid_draft";

/**
 * "Editar" do card (§6.5 item 3). Só muda o que o card deixa editar; tipo, código do chamado
 * e referência vêm do rascunho guardado. A prioridade nunca vem do cliente: se os sinais
 * mudaram, é derivada de novo em código (§3.5).
 */
export const edit = mutation({
  args: { conversationId: v.string(), pendingActionId: v.string(), action: vPendingAction },
  handler: async (
    ctx,
    { conversationId, pendingActionId, action },
  ): Promise<Result<PendingAction, EditDraftError>> => {
    const employee = await requireEmployee(ctx);
    const found = await findOwnedDraft(ctx, employee._id, conversationId, pendingActionId);
    if (!found) return err("not_found");

    const { conversation, pendingAction } = found;
    if (pendingAction.status !== "pending") return err("not_pending");
    if (conversation.status === "closed") return err("closed");
    if (conversation.agentBusy) return err("busy");

    const edited = applyDraftEdit(pendingAction.action, action);
    if (!edited) return err("invalid_draft");

    await ctx.db.patch(pendingAction._id, { action: edited });
    return ok(edited);
  },
});

/** A ação editada e validada, ou null se o tipo mudou ou algum campo ficou vazio. */
export function applyDraftEdit(stored: PendingAction, edited: PendingAction): PendingAction | null {
  switch (stored.kind) {
    case "create_ticket": {
      if (edited.kind !== "create_ticket") return null;
      const ticket = editNewTicket(stored.ticket, edited.ticket);
      return ticket ? { ...stored, ticket } : null;
    }
    case "update_ticket": {
      if (edited.kind !== "update_ticket") return null;
      const text = cleanText(edited.text, TEXT_MAX_LENGTH);
      return text ? { ...stored, text } : null;
    }
    case "reopen_ticket": {
      if (edited.kind !== "reopen_ticket") return null;
      const reason = cleanText(edited.reason, TEXT_MAX_LENGTH);
      return reason ? { ...stored, reason } : null;
    }
  }
}

function editNewTicket(stored: NewTicket, edited: NewTicket): NewTicket | null {
  const title = cleanText(edited.title, TITLE_MAX_LENGTH);
  const description = cleanText(edited.description, TEXT_MAX_LENGTH);
  const affected = cleanText(edited.affected, AFFECTED_MAX_LENGTH);
  if (!title || !description || !affected) return null;

  const signals: PrioritySignals = {
    impact: edited.prioritySignals.impact,
    blocked: edited.prioritySignals.blocked,
    deadlineToday: edited.prioritySignals.deadlineToday,
  };
  const derived = sameSignals(stored.prioritySignals, signals)
    ? { priority: stored.priority, reason: stored.priorityReason }
    : derivePriority({ kind: stored.kind, ...signals });

  return {
    ...stored,
    title,
    description,
    affected,
    category: edited.category,
    prioritySignals: signals,
    priority: derived.priority,
    priorityReason: derived.reason,
  };
}

function sameSignals(a: PrioritySignals, b: PrioritySignals): boolean {
  return a.impact === b.impact && a.blocked === b.blocked && a.deadlineToday === b.deadlineToday;
}

/** Sem espaços nas pontas e com senhas mascaradas (§11.3); null se vazio ou longo demais. */
function cleanText(text: string, maxLength: number): string | null {
  const cleaned = maskSensitiveData(text.trim()).text;
  if (cleaned === "" || cleaned.length > maxLength) return null;
  return cleaned;
}

// ---------- Escritas do servidor (com o segredo) ----------

const vServerDraftArgs = {
  secret: v.string(),
  employeeId: v.id("people"),
  conversationId: v.string(),
  pendingActionId: v.string(),
};

export type ServerDraftError = "not_found" | "not_pending";

/**
 * O serviço de chamados já gravou: mensagem do assistente com o card do chamado e o prazo,
 * rascunho `confirmed` e, no caso crítico, a transferência (§6.3). Clique duplo: o segundo
 * encontra o rascunho já confirmado e não grava nada.
 */
export const completeConfirm = mutation({
  args: { ...vServerDraftArgs, ticketCode: v.string(), replyText: v.string() },
  handler: async (
    ctx,
    { secret, employeeId, conversationId, pendingActionId, ticketCode, replyText },
  ): Promise<Result<{ alreadyConfirmed: boolean; transferred: boolean }, ServerDraftError>> => {
    requireAgentServer(secret);
    const found = await findOwnedDraft(ctx, employeeId, conversationId, pendingActionId);
    if (!found) return err("not_found");

    const { conversation, pendingAction } = found;
    if (pendingAction.status === "confirmed") {
      return ok({ alreadyConfirmed: true, transferred: false });
    }
    if (pendingAction.status !== "pending") return err("not_pending");

    const now = Date.now();
    await ctx.db.insert("messages", {
      conversationId: conversation._id,
      role: "assistant",
      parts: [
        { type: "text", text: replyText },
        { type: "ticket", code: ticketCode },
      ],
      status: "complete",
      createdAt: now,
    });
    await resolveDraft(ctx, conversation, pendingAction, now, {
      status: "confirmed",
      resultTicketCode: ticketCode,
    });

    const transferred =
      pendingAction.handoffOnConfirm &&
      (await transferCriticalCase(ctx, conversation, {
        summary: criticalCaseSummary(pendingAction.action, { confirmedAs: ticketCode }),
        ticketCode,
        // +1: o banner fica depois do card do chamado, criado no mesmo instante.
        at: now + 1,
      }));
    return ok({ alreadyConfirmed: false, transferred });
  },
});

/**
 * O serviço de chamados não gravou (legado fora do ar depois do retry, ou recusou): mensagem
 * honesta do assistente com a parte `error`. O rascunho continua pendente; o "Tentar de
 * novo" dessa mensagem confirma de novo (ver `retry.start`).
 */
export const recordConfirmFailure = mutation({
  args: { ...vServerDraftArgs, message: v.string(), retryable: v.boolean() },
  handler: async (
    ctx,
    { secret, employeeId, conversationId, pendingActionId, message, retryable },
  ): Promise<Result<null, ServerDraftError>> => {
    requireAgentServer(secret);
    const found = await findOwnedDraft(ctx, employeeId, conversationId, pendingActionId);
    if (!found) return err("not_found");

    const { conversation, pendingAction } = found;
    if (pendingAction.status !== "pending") return err("not_pending");

    const now = Date.now();
    await ctx.db.insert("messages", {
      conversationId: conversation._id,
      role: "assistant",
      parts: [{ type: "error", message, retryable }],
      status: "error",
      failedPendingActionId: pendingAction._id,
      createdAt: now,
    });
    await ctx.db.patch(conversation._id, { lastMessageAt: now });
    return ok(null);
  },
});

/**
 * "Cancelar" do card (§6.5 item 4): descarta com o evento visível "Rascunho cancelado".
 * Caso crítico recusado transfere mesmo assim (§6.3).
 */
export const cancel = mutation({
  args: vServerDraftArgs,
  handler: async (
    ctx,
    { secret, employeeId, conversationId, pendingActionId },
  ): Promise<Result<{ alreadyCancelled: boolean; transferred: boolean }, ServerDraftError>> => {
    requireAgentServer(secret);
    const found = await findOwnedDraft(ctx, employeeId, conversationId, pendingActionId);
    if (!found) return err("not_found");

    const { conversation, pendingAction } = found;
    if (pendingAction.status === "cancelled") {
      return ok({ alreadyCancelled: true, transferred: false });
    }
    if (pendingAction.status !== "pending") return err("not_pending");

    const now = Date.now();
    await ctx.db.insert("messages", {
      conversationId: conversation._id,
      role: "system",
      parts: [{ type: "event", kind: "draft_cancelled" }],
      status: "complete",
      createdAt: now,
    });
    await resolveDraft(ctx, conversation, pendingAction, now, { status: "cancelled" });

    const transferred =
      pendingAction.handoffOnConfirm &&
      (await transferCriticalCase(ctx, conversation, {
        summary: criticalCaseSummary(pendingAction.action, { confirmedAs: null }),
        ticketCode: ticketCodeOf(pendingAction.action),
        at: now + 1,
      }));
    return ok({ alreadyCancelled: false, transferred });
  },
});

// ---------- Apoio ----------

/** Conversa e rascunho, se a conversa é do funcionário e o rascunho é dela. */
async function findOwnedDraft(
  ctx: QueryCtx,
  employeeId: Id<"people">,
  conversationId: string,
  pendingActionId: string,
): Promise<{ conversation: Doc<"conversations">; pendingAction: Doc<"pendingActions"> } | null> {
  const conversation = await findOwnedConversation(ctx, employeeId, conversationId);
  if (!conversation) return null;

  const id = ctx.db.normalizeId("pendingActions", pendingActionId);
  const pendingAction = id ? await ctx.db.get(id) : null;
  if (!pendingAction || pendingAction.conversationId !== conversation._id) return null;
  return { conversation, pendingAction };
}

/** Estado final do rascunho; a conversa deixa de apontar para ele. */
async function resolveDraft(
  ctx: MutationCtx,
  conversation: Doc<"conversations">,
  pendingAction: Doc<"pendingActions">,
  now: number,
  outcome: { status: "confirmed"; resultTicketCode: string } | { status: "cancelled" },
) {
  await ctx.db.patch(pendingAction._id, { ...outcome, resolvedAt: now });
  await ctx.db.patch(conversation._id, {
    lastMessageAt: now,
    ...(conversation.pendingActionId === pendingAction._id && { pendingActionId: undefined }),
  });
}

/**
 * Transferência da política Crítica. Se a conversa já não está com o agent (ex.: o
 * funcionário já pediu um analista), não há o que transferir.
 */
async function transferCriticalCase(
  ctx: MutationCtx,
  conversation: Doc<"conversations">,
  handoff: { summary: string; ticketCode: string | undefined; at: number },
): Promise<boolean> {
  const current = await ctx.db.get(conversation._id);
  if (!current) return false;
  const result = await transferToAnalyst(
    ctx,
    current,
    { reason: "critical", summary: handoff.summary, ticketCode: handoff.ticketCode },
    handoff.at,
  );
  return result.ok;
}

function ticketCodeOf(action: PendingAction): string | undefined {
  return action.kind === "create_ticket" ? undefined : action.code;
}

/** Resumo do caso para o analista (§3.3): toda transferência leva um. */
export function criticalCaseSummary(
  action: PendingAction,
  { confirmedAs }: { confirmedAs: string | null },
): string {
  const outcome = confirmedAs
    ? `O funcionário confirmou o rascunho: ${confirmedAs} registrado.`
    : "O funcionário cancelou o rascunho; transferido mesmo assim por ser crítico.";

  switch (action.kind) {
    case "create_ticket": {
      const { title, description, affected } = action.ticket;
      return `Caso crítico: ${title}. ${description} Afetados: ${affected}. ${outcome}`;
    }
    case "update_ticket":
      return `Caso crítico no ${action.code}: ${action.text} ${outcome}`;
    case "reopen_ticket":
      return `Caso crítico, reabertura do ${action.code}: ${action.reason} ${outcome}`;
  }
}
