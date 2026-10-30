import { v } from "convex/values";

import type { MessagePart } from "../src/domain/message-parts";
import { err, ok, type Result } from "../src/domain/result";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { findOwnedConversation } from "./conversations";
import { requireAgentServer, requireEmployee } from "./lib/guards";
import { TURN_TIMEOUT_MS } from "./messages";
import { isDailyCostLimitReached } from "./usage";

// "Tentar de novo" (§5.6, §10): repete o que falhou por último na conversa. Duas origens:
//   - turno do agent (LLM ou legado fora do ar durante o turno): novo turno com o último
//     texto do funcionário;
//   - confirmação de rascunho com o legado fora do ar (`failedPendingActionId`): confirma
//     de novo, sem passar pelo modelo.

/** De quem é a conversa; a rota usa o id para as escritas do servidor. */
export const loadForEmployee = query({
  args: { conversationId: v.string() },
  handler: async (
    ctx,
    { conversationId },
  ): Promise<
    Result<{ employeeId: Id<"people">; conversationId: Id<"conversations"> }, "not_found">
  > => {
    const employee = await requireEmployee(ctx);
    const conversation = await findOwnedConversation(ctx, employee._id, conversationId);
    if (!conversation) return err("not_found");
    return ok({ employeeId: employee._id, conversationId: conversation._id });
  },
});

export type RetryPlan =
  | { kind: "turn"; assistantMessageId: Id<"messages">; userText: string }
  | { kind: "confirm"; pendingActionId: Id<"pendingActions"> };

export type StartRetryError =
  "not_found" | "not_agent" | "busy" | "nothing_to_retry" | "daily_limit_reached";

/**
 * Prepara a repetição numa transação só: a falha deixa de ser "repetível" (o botão some,
 * e um clique duplo não repete duas vezes) e, se for um turno, já nasce a nova resposta em
 * `streaming` com `agentBusy` e o timeout, como em `sendUserMessage`.
 *
 * Repetir um turno respeita o teto diário de custo (§12.3), como uma mensagem nova: atingido,
 * recusa antes de mexer na falha, e o "Tentar de novo" continua lá para amanhã. Repetir a
 * confirmação do rascunho não usa o modelo e não passa pelo teto.
 */
export const start = mutation({
  args: { secret: v.string(), employeeId: v.id("people"), conversationId: v.string() },
  handler: async (
    ctx,
    { secret, employeeId, conversationId },
  ): Promise<Result<RetryPlan, StartRetryError>> => {
    requireAgentServer(secret);
    const conversation = await findOwnedConversation(ctx, employeeId, conversationId);
    if (!conversation) return err("not_found");
    if (conversation.status !== "agent") return err("not_agent");
    if (conversation.agentBusy) return err("busy");

    const failed = await lastMessageFrom(ctx, conversation._id, "assistant");
    if (!failed || !isRetryableFailure(failed)) return err("nothing_to_retry");

    if (failed.failedPendingActionId) {
      await ctx.db.patch(failed._id, { parts: failed.parts.map(withoutRetry) });
      return ok({ kind: "confirm", pendingActionId: failed.failedPendingActionId });
    }

    const now = Date.now();
    if (await isDailyCostLimitReached(ctx, now)) return err("daily_limit_reached");
    await ctx.db.patch(failed._id, { parts: failed.parts.map(withoutRetry) });

    const userMessage = await lastMessageFrom(ctx, conversation._id, "user");
    const userText = userMessage ? textOf(userMessage) : "";
    if (userText === "") return err("nothing_to_retry");

    const assistantMessageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      role: "assistant",
      parts: [],
      status: "streaming",
      createdAt: now,
    });
    await ctx.db.patch(conversation._id, { agentBusy: true, lastMessageAt: now });
    await ctx.scheduler.runAfter(TURN_TIMEOUT_MS, internal.messages.expireTurn, {
      messageId: assistantMessageId,
    });
    return ok({ kind: "turn", assistantMessageId, userText });
  },
});

async function lastMessageFrom(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
  role: Doc<"messages">["role"],
): Promise<Doc<"messages"> | null> {
  return await ctx.db
    .query("messages")
    .withIndex("by_conversation_createdAt", (q) => q.eq("conversationId", conversationId))
    .order("desc")
    .filter((q) => q.eq(q.field("role"), role))
    .first();
}

/**
 * Falha repetível = mensagem com parte `error` e `retryable`, qualquer que seja o status: o
 * turno do pipeline que falha termina `complete` (com a parte de erro e o `decisionId`), e o
 * `fail` e o timeout terminam `error`.
 */
function isRetryableFailure(message: Doc<"messages">): boolean {
  return message.parts.some((part) => part.type === "error" && part.retryable);
}

function withoutRetry(part: MessagePart): MessagePart {
  return part.type === "error" ? { ...part, retryable: false } : part;
}

function textOf(message: Doc<"messages">): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}
