import { v } from "convex/values";

import type { MessagePart } from "../src/domain/message-parts";
import { advanceMark, messageReceipt } from "../src/domain/read-receipts";
import { err, ok, type Result } from "../src/domain/result";
import { maskSensitiveData } from "../src/domain/sensitive-data";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { findOwnedConversation, readMessageLimit } from "./conversations";
import { requireAgentServer, requireEmployee } from "./lib/guards";
import { vMessagePart } from "./lib/validators";
import { isDailyCostLimitReached } from "./usage";

// Mensagens do chat e o ciclo de um turno do agent (§5.7):
//   sendUserMessage → mensagem do assistente em `streaming` + agentBusy + timeout agendado
//   appendDelta* → finalize | fail | expireTurn (o que vier primeiro; os outros viram no-op)

/** Depois disso, o job agendado encerra o turno com erro e libera o campo (§10). */
export const TURN_TIMEOUT_MS = 60_000;

const SUBJECT_MAX_LENGTH = 80;

const TIMEOUT_ERROR_MESSAGE =
  "A resposta demorou mais do que devia e foi interrompida. Tente mandar de novo.";

// ---------- Leitura ----------

/** Mensagens da conversa em ordem de criação; null se a conversa não é do funcionário. */
export const list = query({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    const employee = await requireEmployee(ctx);
    const conversation = await findOwnedConversation(ctx, employee._id, conversationId);
    if (!conversation) return null;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_createdAt", (q) => q.eq("conversationId", conversation._id))
      .order("asc")
      .collect();
    return await Promise.all(
      messages.map(async (message) => ({
        ...(await withAnalystAuthor(ctx, message)),
        receipt: messageReceipt(message, conversation),
      })),
    );
  },
});

/** Mensagens do analista levam nome e nível, para a tela mostrar quem escreveu (§7.2). */
async function withAnalystAuthor(ctx: QueryCtx, message: Doc<"messages">) {
  const author =
    message.role === "analyst" && message.authorId ? await ctx.db.get(message.authorId) : null;
  return {
    ...message,
    analyst: author ? { name: author.name, level: author.level ?? null } : null,
  };
}

// ---------- Mensagem do funcionário ----------

export type SendUserMessageError = "not_found" | "closed" | "busy" | "limit_reached" | "empty";

export interface SentUserMessage {
  conversationId: Id<"conversations">;
  userMessageId: Id<"messages">;
  /** Mensagem do assistente em `streaming`; null quando a conversa está com analista. */
  assistantMessageId: Id<"messages"> | null;
  /** O texto como foi salvo, já mascarado: é ele que vai para o agent. */
  savedText: string;
  /** Verdadeiro se a máscara removeu algo; o agent dá o aviso educativo (§11.3). */
  masked: boolean;
}

/**
 * Salva a mensagem do funcionário. Só em `agent` prepara o turno: cria a resposta vazia em
 * `streaming`, marca `agentBusy` e agenda o timeout. Com analista, só salva (§5.5).
 *
 * Teto diário de custo atingido (§12.3): a mensagem é salva do mesmo jeito, mas o turno não
 * começa (`assistantMessageId` null). O campo mostra o aviso com "Falar com um analista", e o
 * analista que assumir lê a mensagem: nada do que o funcionário escreveu se perde.
 */
export const sendUserMessage = mutation({
  args: { conversationId: v.string(), text: v.string() },
  handler: async (
    ctx,
    { conversationId, text },
  ): Promise<Result<SentUserMessage, SendUserMessageError>> => {
    const employee = await requireEmployee(ctx);
    const conversation = await findOwnedConversation(ctx, employee._id, conversationId);
    if (!conversation) return err("not_found");
    if (conversation.status === "closed") return err("closed");
    if (conversation.agentBusy) return err("busy");
    if (conversation.employeeMessageCount >= readMessageLimit()) return err("limit_reached");

    const trimmed = text.trim();
    if (trimmed === "") return err("empty");
    const { text: savedText, masked } = maskSensitiveData(trimmed);

    const now = Date.now();
    const agentShouldAnswer =
      conversation.status === "agent" && !(await isDailyCostLimitReached(ctx, now));
    const userMessageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      role: "user",
      authorId: employee._id,
      parts: [{ type: "text", text: savedText }],
      status: "complete",
      // Sem turno (com analista ou no teto diário), quem lê é o analista que atender.
      receiver: agentShouldAnswer ? "agent" : "analyst",
      createdAt: now,
    });

    await ctx.db.patch(conversation._id, {
      employeeMessageCount: conversation.employeeMessageCount + 1,
      lastMessageAt: now,
      subject: conversation.subject ?? toSubject(savedText),
      agentBusy: agentShouldAnswer,
    });

    const assistantMessageId = agentShouldAnswer
      ? await startAgentTurn(ctx, conversation._id, now)
      : null;

    return ok({
      conversationId: conversation._id,
      userMessageId,
      assistantMessageId,
      savedText,
      masked,
    });
  },
});

function toSubject(text: string): string {
  const singleLine = text.replace(/\s+/g, " ");
  if (singleLine.length <= SUBJECT_MAX_LENGTH) return singleLine;
  return `${singleLine.slice(0, SUBJECT_MAX_LENGTH - 1).trimEnd()}…`;
}

async function startAgentTurn(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  now: number,
): Promise<Id<"messages">> {
  const messageId = await ctx.db.insert("messages", {
    conversationId,
    role: "assistant",
    parts: [],
    status: "streaming",
    // +1: fica sempre depois da mensagem do funcionário, criada no mesmo instante.
    createdAt: now + 1,
  });
  await ctx.scheduler.runAfter(TURN_TIMEOUT_MS, internal.messages.expireTurn, { messageId });
  return messageId;
}

// ---------- Confirmação de leitura do funcionário (UX1) ----------
// O chat confirma as respostas do agent e do analista até `upTo` (o instante da última que
// ele recebeu). Só o dono da conversa confirma; repetir não escreve nada.

/** "Chegou": o chat do funcionário recebeu as mensagens até `upTo`. */
export const markDelivered = mutation({
  args: { conversationId: v.string(), upTo: v.number() },
  handler: async (ctx, { conversationId, upTo }): Promise<void> => {
    const employee = await requireEmployee(ctx);
    const conversation = await findOwnedConversation(ctx, employee._id, conversationId);
    if (!conversation) return;

    const deliveredAt = advanceMark(conversation.employeeDeliveredAt, upTo, Date.now());
    if (deliveredAt !== null)
      await ctx.db.patch(conversation._id, { employeeDeliveredAt: deliveredAt });
  },
});

/** "Leu": a conversa está aberta, com a aba visível, e mostra as mensagens até `upTo`. */
export const markRead = mutation({
  args: { conversationId: v.string(), upTo: v.number() },
  handler: async (ctx, { conversationId, upTo }): Promise<void> => {
    const employee = await requireEmployee(ctx);
    const conversation = await findOwnedConversation(ctx, employee._id, conversationId);
    if (!conversation) return;

    const now = Date.now();
    const readAt = advanceMark(conversation.employeeReadAt, upTo, now);
    if (readAt === null) return;
    // Quem leu também recebeu.
    const deliveredAt = advanceMark(conversation.employeeDeliveredAt, upTo, now);
    await ctx.db.patch(conversation._id, {
      employeeReadAt: readAt,
      ...(deliveredAt === null ? {} : { employeeDeliveredAt: deliveredAt }),
    });
  },
});

// ---------- Escritas do agent (só o servidor do Next, com o segredo) ----------
// Todas devolvem `true` se escreveram e `false` se a mensagem já não está em `streaming`
// (finalizada, com erro ou expirada): o agent para de transmitir ao receber `false`.

/** Acrescenta um pedaço do texto em streaming (lotes de ~150 ms, §5.7). */
export const appendDelta = mutation({
  args: { secret: v.string(), messageId: v.id("messages"), delta: v.string() },
  handler: async (ctx, { secret, messageId, delta }): Promise<boolean> => {
    requireAgentServer(secret);
    const message = await findStreamingMessage(ctx, messageId);
    if (!message) return false;

    await ctx.db.patch(message._id, { parts: appendText(message.parts, delta) });
    return true;
  },
});

/**
 * Conclui o turno: as partes estruturadas entram depois do texto já transmitido. Com `text`,
 * o texto transmitido é trocado por ele (correção feita em código depois do AGIR, decisão 25).
 */
export const finalize = mutation({
  args: {
    secret: v.string(),
    messageId: v.id("messages"),
    parts: v.array(vMessagePart),
    decisionId: v.optional(v.id("decisions")),
    text: v.optional(v.string()),
  },
  handler: async (ctx, { secret, messageId, parts, decisionId, text }): Promise<boolean> => {
    requireAgentServer(secret);
    const message = await findStreamingMessage(ctx, messageId);
    if (!message) return false;

    const streamed = text === undefined ? message.parts : replaceText(message.parts, text);
    await ctx.db.patch(message._id, {
      parts: [...streamed, ...parts],
      status: "complete",
      decisionId,
    });
    await endAgentTurn(ctx, message.conversationId);
    return true;
  },
});

/** Encerra o turno com erro amigável (§10); o texto já transmitido fica. */
export const fail = mutation({
  args: {
    secret: v.string(),
    messageId: v.id("messages"),
    message: v.string(),
    retryable: v.boolean(),
  },
  handler: async (ctx, { secret, messageId, message, retryable }): Promise<boolean> => {
    requireAgentServer(secret);
    return await failStreamingMessage(ctx, messageId, message, retryable);
  },
});

/** Timeout de segurança (§5.7, passo 8): agendado por `sendUserMessage`. */
export const expireTurn = internalMutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }): Promise<boolean> => {
    return await failStreamingMessage(ctx, messageId, TIMEOUT_ERROR_MESSAGE, true);
  },
});

async function findStreamingMessage(
  ctx: MutationCtx,
  messageId: Id<"messages">,
): Promise<Doc<"messages"> | null> {
  const message = await ctx.db.get(messageId);
  return message?.status === "streaming" ? message : null;
}

async function failStreamingMessage(
  ctx: MutationCtx,
  messageId: Id<"messages">,
  errorMessage: string,
  retryable: boolean,
): Promise<boolean> {
  const message = await findStreamingMessage(ctx, messageId);
  if (!message) return false;

  const errorPart: MessagePart = { type: "error", message: errorMessage, retryable };
  await ctx.db.patch(message._id, { parts: [...message.parts, errorPart], status: "error" });
  await endAgentTurn(ctx, message.conversationId);
  return true;
}

async function endAgentTurn(ctx: MutationCtx, conversationId: Id<"conversations">) {
  await ctx.db.patch(conversationId, { agentBusy: false, lastMessageAt: Date.now() });
}

/** Soma o pedaço ao último bloco de texto, ou abre um novo se o último não for texto. */
/** Troca as partes de texto por um texto só, no lugar da primeira; as outras partes ficam. */
function replaceText(parts: MessagePart[], text: string): MessagePart[] {
  const firstText = parts.findIndex((part) => part.type === "text");
  const others = parts.filter((part) => part.type !== "text");
  if (text === "") return others;
  const at = firstText === -1 ? 0 : firstText;
  return [...others.slice(0, at), { type: "text", text }, ...others.slice(at)];
}

function appendText(parts: MessagePart[], delta: string): MessagePart[] {
  const last = parts.at(-1);
  if (last?.type === "text") {
    return [...parts.slice(0, -1), { type: "text", text: last.text + delta }];
  }
  return [...parts, { type: "text", text: delta }];
}
