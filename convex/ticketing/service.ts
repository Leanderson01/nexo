import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { vNewTicket, vTicketFieldChanges, vTicketUpdateAuthor } from "../lib/validators";
import type { TicketKind, TicketStatus, TicketUpdateAuthor } from "../../src/domain/enums";
import { err, ok, type Result } from "../../src/domain/result";
import type { TicketDetail, TicketFieldChanges } from "../../src/domain/ticket";
import { canReopen, isOpen, notifiesOwner } from "../../src/domain/ticket-rules";
import { notifyOwnerInChat } from "./notifyOwner";
import { findOwnedTicket, loadDetail, ticketNotFound, type ServiceError } from "./reads";

// Escritas do serviço de chamados (o "legado" simulado, §5.6). Só a API HTTP chama
// estas internal mutations, sempre com o funcionário da requisição.
//
// Regras do prazo (§3.6 e decisão 6): `lastActivityAt` é a base do SLA e só renova com
// atividade do suporte (analista ou agent) e com a reabertura. Atualização do
// funcionário entra no histórico, mas não reinicia o prazo.

// ---------- create ----------

export const create = internalMutation({
  args: { employeeId: v.id("people"), ticket: vNewTicket, idempotencyKey: v.string() },
  handler: async (ctx, args): Promise<Result<TicketDetail, ServiceError>> => {
    const replay = await replayIdempotentWrite(ctx, args.employeeId, args.idempotencyKey);
    if (replay) return replay;

    const now = Date.now();
    const code = await nextTicketCode(ctx, args.ticket.kind);
    const ticketId = await ctx.db.insert("tickets", {
      ...args.ticket,
      code,
      status: "open",
      ownerId: args.employeeId,
      createdAt: now,
      lastActivityAt: now,
    });
    await ctx.db.insert("ticketUpdates", {
      ticketId,
      authorType: "agent",
      text: "Chamado aberto pelo Nexo Assist a pedido do funcionário.",
      createdAt: now,
    });
    await rememberIdempotencyKey(ctx, args.idempotencyKey, code);
    return ok(await loadDetailById(ctx, ticketId));
  },
});

/** Próximo código do tipo, com 5 dígitos: "INC-20421". Sem contador, começa em 00001. */
async function nextTicketCode(ctx: MutationCtx, kind: TicketKind): Promise<string> {
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", kind))
    .unique();

  let value: number;
  if (counter) {
    value = counter.value + 1;
    await ctx.db.patch(counter._id, { value });
  } else {
    value = 1;
    await ctx.db.insert("counters", { name: kind, value });
  }
  return `${kind}-${String(value).padStart(5, "0")}`;
}

// ---------- addUpdate ----------

export const addUpdate = internalMutation({
  args: {
    employeeId: v.id("people"),
    code: v.string(),
    text: v.string(),
    fieldChanges: v.optional(vTicketFieldChanges),
    authorType: vTicketUpdateAuthor,
    authorName: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args): Promise<Result<TicketDetail, ServiceError>> => {
    const replay = await replayIdempotentWrite(ctx, args.employeeId, args.idempotencyKey);
    if (replay) return replay;

    const ticket = await findOwnedTicket(ctx, args.employeeId, args.code);
    if (!ticket) return err(ticketNotFound);

    const recorded = await recordTicketUpdate(ctx, ticket, {
      text: args.text,
      fieldChanges: args.fieldChanges,
      authorType: args.authorType,
      authorName: args.authorName,
    });
    if (!recorded.ok) return recorded;
    await rememberIdempotencyKey(ctx, args.idempotencyKey, ticket.code);
    return ok(await loadDetailById(ctx, ticket._id));
  },
});

export interface TicketUpdateInput {
  text: string;
  fieldChanges?: TicketFieldChanges;
  authorType: TicketUpdateAuthor;
  authorName?: string;
}

/**
 * Grava uma atualização num chamado já conferido (dono e existência). Usada pelo `addUpdate`
 * da API e pelo "Registrar atualização" do console (T17). Quando o autor é o suporte, avisa o
 * dono no chat na mesma transação (§11.6): o evento sai uma vez por atualização gravada, e a
 * repetição pela mesma chave de idempotência volta antes de chegar aqui.
 */
export async function recordTicketUpdate(
  ctx: MutationCtx,
  ticket: Doc<"tickets">,
  update: TicketUpdateInput,
): Promise<Result<null, ServiceError>> {
  if (ticket.status === "closed") {
    return err({
      kind: "conflict",
      message: "Esse chamado está fechado e não recebe atualizações. Abra um novo chamado.",
    });
  }
  if (update.authorType === "employee" && update.fieldChanges?.status !== undefined) {
    return err({
      kind: "validation",
      message: "Só o suporte muda o status de um chamado.",
    });
  }

  const now = Date.now();
  await ctx.db.patch(ticket._id, {
    ...ticketPatchFor(ticket, update.fieldChanges ?? {}, now),
    ...(renewsDeadline(update.authorType) && { lastActivityAt: now }),
  });
  await ctx.db.insert("ticketUpdates", {
    ticketId: ticket._id,
    authorType: update.authorType,
    authorName: update.authorName,
    text: update.text,
    fieldChanges: update.fieldChanges,
    createdAt: now,
  });
  if (notifiesOwner(update.authorType)) {
    await notifyOwnerInChat(ctx, ticket, update, now);
  }
  return ok(null);
}

/** Só a atividade do suporte reinicia o prazo (§3.6). */
function renewsDeadline(authorType: TicketUpdateAuthor): boolean {
  return authorType === "analyst" || authorType === "agent";
}

/**
 * Campos do chamado que mudam com a atualização. Ao encerrar (Resolvido ou Fechado), grava
 * `resolvedAt`: a janela de duplicidade de 30 dias conta a partir dele. Voltar para um
 * status aberto limpa a data.
 */
function ticketPatchFor(
  ticket: Doc<"tickets">,
  changes: TicketFieldChanges,
  now: number,
): Partial<Doc<"tickets">> {
  const patch: Partial<Doc<"tickets">> = {};
  if (changes.priority !== undefined) patch.priority = changes.priority;
  if (changes.priorityReason !== undefined) patch.priorityReason = changes.priorityReason;
  if (changes.category !== undefined) patch.category = changes.category;
  if (changes.status !== undefined) {
    patch.status = changes.status;
    patch.resolvedAt = resolvedAtAfter(ticket, changes.status, now);
  }
  return patch;
}

function resolvedAtAfter(
  ticket: Doc<"tickets">,
  nextStatus: TicketStatus,
  now: number,
): number | undefined {
  if (isOpen(nextStatus)) return undefined;
  // Resolvido → Fechado mantém a data em que o problema foi resolvido.
  return ticket.resolvedAt ?? now;
}

// ---------- reopen ----------

export const reopen = internalMutation({
  args: {
    employeeId: v.id("people"),
    code: v.string(),
    reason: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args): Promise<Result<TicketDetail, ServiceError>> => {
    const replay = await replayIdempotentWrite(ctx, args.employeeId, args.idempotencyKey);
    if (replay) return replay;

    const ticket = await findOwnedTicket(ctx, args.employeeId, args.code);
    if (!ticket) return err(ticketNotFound);

    const now = Date.now();
    if (!canReopen(ticket, now)) {
      return err({
        kind: "conflict",
        message:
          "Só dá para reabrir um chamado resolvido há até 7 dias. Abra um novo chamado com referência a este.",
      });
    }

    // Decisão 6: a reabertura recomeça o atendimento, e o prazo recomeça junto.
    await ctx.db.patch(ticket._id, { status: "open", resolvedAt: undefined, lastActivityAt: now });
    await ctx.db.insert("ticketUpdates", {
      ticketId: ticket._id,
      authorType: "employee",
      text: args.reason,
      fieldChanges: { status: "open" },
      createdAt: now,
    });
    await rememberIdempotencyKey(ctx, args.idempotencyKey, ticket.code);
    return ok(await loadDetailById(ctx, ticket._id));
  },
});

// ---------- markHandoff ----------

export const markHandoff = internalMutation({
  args: {
    employeeId: v.id("people"),
    code: v.union(v.string(), v.null()),
    conversationId: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args): Promise<Result<null, ServiceError>> => {
    // Transferência sem chamado em foco: nada a registrar no legado.
    if (args.code === null) return ok(null);

    const replay = await replayIdempotentWrite(ctx, args.employeeId, args.idempotencyKey);
    if (replay) return replay.ok ? ok(null) : replay;

    const ticket = await findOwnedTicket(ctx, args.employeeId, args.code);
    if (!ticket) return err(ticketNotFound);

    // Não renova `lastActivityAt`: um chamado vencido continua vencido para o analista.
    const movesToAnalyst = isOpen(ticket.status) && ticket.status !== "awaiting_analyst";
    if (movesToAnalyst) await ctx.db.patch(ticket._id, { status: "awaiting_analyst" });
    await ctx.db.insert("ticketUpdates", {
      ticketId: ticket._id,
      authorType: "agent",
      text: "Conversa transferida para um analista pelo Nexo Assist.",
      ...(movesToAnalyst && { fieldChanges: { status: "awaiting_analyst" as const } }),
      createdAt: Date.now(),
    });
    await rememberIdempotencyKey(ctx, args.idempotencyKey, ticket.code);
    return ok(null);
  },
});

// ---------- Idempotência ----------

/**
 * Se a chave já foi usada, devolve o chamado gravado na primeira vez, sem escrever de novo.
 * Só para o dono: com a chave de outro funcionário a resposta é o mesmo `not_found`.
 * Devolve null quando a chave é nova e a escrita deve acontecer.
 */
async function replayIdempotentWrite(
  ctx: MutationCtx,
  employeeId: Id<"people">,
  idempotencyKey: string,
): Promise<Result<TicketDetail, ServiceError> | null> {
  const used = await ctx.db
    .query("idempotencyKeys")
    .withIndex("by_key", (q) => q.eq("key", idempotencyKey))
    .unique();
  if (!used) return null;

  const ticket = await findOwnedTicket(ctx, employeeId, used.ticketCode);
  if (!ticket) return err(ticketNotFound);
  return ok(await loadDetail(ctx, ticket));
}

async function rememberIdempotencyKey(ctx: MutationCtx, key: string, ticketCode: string) {
  await ctx.db.insert("idempotencyKeys", { key, ticketCode, createdAt: Date.now() });
}

async function loadDetailById(ctx: MutationCtx, ticketId: Id<"tickets">): Promise<TicketDetail> {
  const ticket = await ctx.db.get(ticketId);
  if (!ticket) throw new Error(`Chamado ${ticketId} sumiu no meio da escrita.`);
  return await loadDetail(ctx, ticket);
}
