import type { ConvexHttpClient } from "convex/browser";

import type { GuidingAction } from "@/agent/policies/run-policies";
import { buildTurnBriefing } from "@/agent/prompts/turn-briefing";
import { createTools } from "@/agent/tools/create-tools";
import { listMyTicketsTool } from "@/agent/tools/list-my-tickets";
import type { ToolSession } from "@/agent/tools/tool-session";
import { withTrace, type TraceEnvironment } from "@/agent/tools/with-trace";
import type { TurnStage } from "@/domain/enums";
import type { MessagePart } from "@/domain/message-parts";
import { computeDueAt } from "@/domain/sla";
import type { Understanding } from "@/domain/understanding";

import type { Id } from "../../../convex/_generated/dataModel";
import { act } from "./act";
import type { TurnStatePatch } from "./agent-store";
import {
  buildHandoffSummary,
  LEGACY_UNAVAILABLE_REPLY,
  MODEL_FAILURE_REPLY,
  sensitiveDataNotice,
  shortCircuitReply,
  type CodeReply,
} from "./code-replies";
import { buildReturnContext, loadContext, type LoadedContext } from "./context-loader";
import { ACCEPT_HANDOFF_OFFER, decide, DECLINE_HANDOFF_OFFER, type TurnDecision } from "./decide";
import { resolveFocus, type FocusResult } from "./focus";
import { handOffToAnalyst } from "./hand-off";
import { buildDecisionRecord } from "./record";
import { summarizeConversation } from "./rolling-summary";
import {
  createConvexMessageSink,
  StreamingMessage,
  type AgentMessageSink,
} from "./streaming-message";
import {
  createTurnDependencies,
  type EmployeeGateways,
  type TurnDependencies,
} from "./turn-dependencies";
import { decideOutcome } from "./turn-outcome";
import { addModelUsage, emptyUsage, type ModelUsage, type UsageTotals } from "./turn-usage";
import { TurnWorkspace } from "./turn-workspace";
import { understand } from "./understand";

// Um turno do agent (§6.1), disparado pela rota de mensagens depois do 202 (`after()`, §5.7):
//
//   contexto → ENTENDER → chamado em foco → DECIDIR → AGIR (ou resposta em código) → REGISTRAR
//
// - `convex` roda como o funcionário; `agentSecret` autoriza as escritas do agent;
// - a mensagem `assistantMessageId` já existe em `streaming` e a conversa está `agentBusy`.
// `runTurn` nunca lança: qualquer falha inesperada vira `fail` na mensagem, que libera a
// conversa. Se nem isso funcionar, o timeout de 60 s do Convex libera.

export interface RunTurnInput {
  conversationId: Id<"conversations">;
  /** Resposta vazia em `streaming`, criada por `sendUserMessage`. */
  assistantMessageId: Id<"messages">;
  /** Texto do funcionário como foi salvo (já mascarado). */
  userText: string;
  /** Cliente do Convex autenticado como o funcionário. */
  convex: ConvexHttpClient;
  /** AGENT_SERVER_SECRET, lido só no servidor do Next. */
  agentSecret: string;
}

export interface RunTurnOptions {
  /** Dublês de Convex, gateways e LLM (testes). Padrão: lidos do env do servidor. */
  dependencies?: TurnDependencies;
  /** Onde a resposta é escrita. Padrão: as mutations de convex/messages.ts. */
  sink?: AgentMessageSink;
}

export const TURN_ERROR_MESSAGE = "Não consegui responder agora. Tente de novo em instantes.";

export async function runTurn(input: RunTurnInput, options: RunTurnOptions = {}): Promise<void> {
  const sink =
    options.sink ??
    createConvexMessageSink({
      convex: input.convex,
      agentSecret: input.agentSecret,
      messageId: input.assistantMessageId,
    });
  const reply = new StreamingMessage(sink);

  try {
    const dependencies = options.dependencies ?? createTurnDependencies(input);
    await runPipeline(input, dependencies, reply);
  } catch (error) {
    console.error("[runTurn] turno falhou", { conversationId: input.conversationId, error });
    await reply.fail(TURN_ERROR_MESSAGE, true).catch((failError: unknown) => {
      console.error("[runTurn] não consegui gravar o erro; o timeout libera", failError);
    });
  }
}

// ---------- O turno ----------

/** O que as etapas vão produzindo e o REGISTRAR usa no fim. */
interface Turn {
  input: RunTurnInput;
  deps: TurnDependencies;
  reply: StreamingMessage;
  startedAt: number;
  now: number;
  context: LoadedContext;
  workspace: TurnWorkspace;
  gateways: EmployeeGateways;
  usage: UsageTotals;
  replyText: string;
}

async function runPipeline(
  input: RunTurnInput,
  deps: TurnDependencies,
  reply: StreamingMessage,
): Promise<void> {
  const startedAt = deps.now();
  const context = await loadContext({
    store: deps.store,
    userText: input.userText,
    summarize: (previousSummary, messages) =>
      summarizeConversation({ model: deps.llm.models.fast, previousSummary, messages }),
  });
  if (!context) {
    await reply.fail("Não encontrei esta conversa.", false);
    return;
  }

  const turn: Turn = {
    input,
    deps,
    reply,
    startedAt,
    now: startedAt,
    context,
    workspace: new TurnWorkspace(),
    gateways: deps.gatewaysFor(context.snapshot.employee.id),
    usage: context.summaryUsage
      ? addModelUsage(emptyUsage(), deps.llm.fastModel, context.summaryUsage)
      : emptyUsage(),
    replyText: "",
  };

  const notice = sensitiveDataNotice(input.userText);
  if (notice) await write(turn, `${notice}\n\n`);

  // ENTENDER
  const understood = await understand({
    model: deps.llm.models.fast,
    history: context.history,
    stateNote: describeState(context),
  });
  addUsages(turn, deps.llm.fastModel, understood.usage);
  if (!understood.ok) {
    console.error("[runTurn] ENTENDER falhou", understood.error);
    await finishWithError(
      turn,
      { understanding: null, decision: null, stage: "understand" },
      MODEL_FAILURE_REPLY,
    );
    return;
  }
  const understanding = understood.understanding;

  // Chamado em foco (decisão 2) e DECIDIR
  const session = toolSession(turn, understanding);
  const traceEnvironment: TraceEnvironment = {
    traces: turn.workspace.traces,
    openGateways: turn.gateways.openForTool,
  };
  const focus = await resolveFocus({
    understanding,
    selectedTicketCode: context.snapshot.conversation.selectedTicketCode,
    workspace: turn.workspace,
    listEmployeeTickets: () =>
      withTrace(listMyTicketsTool(session), traceEnvironment)({ onlyOpen: null }),
  });
  const decision = decide({
    now: turn.now,
    understanding,
    userText: input.userText,
    conversationStatus: context.snapshot.conversation.status,
    clarificationAttempts: context.snapshot.conversation.clarificationAttempts,
    focusedTicket: focus.resolution.focusedTicket,
    pendingOffer: context.snapshot.conversation.pendingHandoffOffer,
  });
  turn.workspace.derivedPriority = derivedPriorityRecord(decision, turn.now);

  if (decision.decisiveAction) {
    await answerInCode(turn, understanding, decision);
    return;
  }
  if (focus.ticketsUnavailable && needsTicketsToAnswer(understanding)) {
    await finishWithError(
      turn,
      { understanding, decision, stage: "decide" },
      LEGACY_UNAVAILABLE_REPLY,
    );
    return;
  }

  // AGIR
  await answerWithModel(turn, session, traceEnvironment, understanding, decision, focus);
}

// ---------- Curto-circuito ----------

/** Transferir, redirecionar ou recusar: resposta escrita em código, sem o modelo principal. */
async function answerInCode(
  turn: Turn,
  understanding: Understanding,
  decision: TurnDecision,
): Promise<void> {
  const action = decision.decisiveAction;
  if (!action) return;
  const ticketCode =
    decision.acceptedOffer?.ticketCode ??
    turn.workspace.focusedTicket?.code ??
    turn.context.snapshot.conversation.selectedTicketCode;

  if (action.kind === "handoff") {
    const transferred = await handOffToAnalyst({
      store: turn.deps.store,
      tickets: turn.gateways.tickets,
      conversationId: turn.input.conversationId,
      handoff: {
        reason: action.reason,
        summary: buildHandoffSummary({
          reason: action.reason,
          requestSummary: understanding.summary,
          rollingSummary: turn.context.rollingSummary,
          ticketCode,
          recentEmployeeTexts: recentEmployeeTexts(turn.context),
        }),
        ...(ticketCode && { ticketCode }),
      },
    });
    if (transferred.ok) turn.workspace.handoff = action.reason;
    else console.warn("[runTurn] transferência recusada", transferred.error);
  }

  const codeReply = shortCircuitReply(action, { ticketCode });
  await write(turn, codeReply.text);
  await complete(turn, {
    understanding,
    decision,
    shortCircuit: true,
    errorStage: null,
    parts: codeReply.parts,
    usedReturnNote: false,
  });
}

// ---------- AGIR ----------

async function answerWithModel(
  turn: Turn,
  session: ToolSession,
  traceEnvironment: TraceEnvironment,
  understanding: Understanding,
  decision: TurnDecision,
  focus: FocusResult,
): Promise<void> {
  const { workspace, context } = turn;
  const overdueOffer = hasOffer(decision.guidingActions, "overdue")
    ? workspace.focusedTicket
    : null;
  workspace.criticalCase = hasOffer(decision.guidingActions, "critical");
  if (overdueOffer) workspace.showTicket(overdueOffer.code);

  const selectedTicket =
    workspace.employeeTickets?.find(
      (ticket) => ticket.code === context.snapshot.conversation.selectedTicketCode,
    ) ?? null;
  const briefing = buildTurnBriefing({
    now: turn.now,
    employee: context.snapshot.employee,
    understanding,
    rollingSummary: context.rollingSummary,
    returnNote: context.snapshot.conversation.returnNote,
    returnContext: buildReturnContext({
      previousMessageAt: context.previousMessageAt,
      now: turn.now,
      selectedTicket,
    }),
    pendingDraft: context.snapshot.pendingDraft,
    focusedTicket: focus.resolution.focusedTicket,
    ambiguousCandidates: focus.resolution.ambiguousCandidates,
    employeeTickets: workspace.employeeTickets,
    guidingActions: decision.guidingActions,
    overdueExplanation: overdueExplanation(decision),
    sensitiveNoticeWritten: turn.replyText !== "",
  });

  const acted = await act({
    model: turn.deps.llm.models.main,
    briefing,
    history: context.history,
    tools: createTools(session, traceEnvironment),
    onText: (piece) => write(turn, piece),
    shouldStop: () => workspace.legacyUnavailable,
  });
  if (acted.usage) addUsages(turn, turn.deps.llm.mainModel, [acted.usage]);

  if (workspace.legacyUnavailable) {
    await finishWithError(
      turn,
      { understanding, decision, stage: "act" },
      LEGACY_UNAVAILABLE_REPLY,
    );
    return;
  }
  if (!acted.ok) {
    console.error("[runTurn] AGIR falhou", acted.error);
    await finishWithError(turn, { understanding, decision, stage: "act" }, MODEL_FAILURE_REPLY);
    return;
  }

  // As opções da oferta de analista são fixas em código (decisão 22 lê a resposta).
  if (overdueOffer) workspace.offerQuickReplies([ACCEPT_HANDOFF_OFFER, DECLINE_HANDOFF_OFFER]);
  const basedOnArticle = workspace.applicableArticle !== null && /resolveu/i.test(turn.replyText);
  if (basedOnArticle && !workspace.hasQuickReplies()) workspace.offerQuickReplies(["Sim", "Não"]);

  await complete(turn, {
    understanding,
    decision,
    shortCircuit: false,
    errorStage: null,
    parts: workspace.structuredParts({ includeArticle: basedOnArticle }),
    usedReturnNote: context.snapshot.conversation.returnNote !== null,
    overdueOfferCode: overdueOffer?.code ?? null,
  });
}

// ---------- REGISTRAR ----------

interface Completion {
  understanding: Understanding | null;
  decision: TurnDecision | null;
  shortCircuit: boolean;
  errorStage: TurnStage | null;
  parts: MessagePart[];
  usedReturnNote: boolean;
  overdueOfferCode?: string | null;
}

/** Grava o estado da conversa e o `DecisionRecord`, e conclui a mensagem com as partes. */
async function complete(turn: Turn, completion: Completion): Promise<void> {
  const { workspace } = turn;
  const { decision } = completion;
  const shownContent = completion.parts.some((part) =>
    ["article", "ticket", "ticketSelector"].includes(part.type),
  );
  const outcome = decideOutcome({
    failed: completion.errorStage !== null,
    handedOff: workspace.handoff !== null,
    decisiveAction: decision?.decisiveAction ?? null,
    draftProposed: workspace.draft !== null,
    clarificationRequested:
      decision?.guidingActions.some((action) => action.kind === "ask_clarification") ?? false,
    intent: completion.understanding?.intent ?? null,
    showedContent: shownContent,
    replyText: turn.replyText,
  });

  await turn.deps.store.saveTurnState(statePatch(turn, completion));

  const record = buildDecisionRecord({
    now: turn.now,
    latencyMs: Math.max(0, turn.deps.now() - turn.startedAt),
    understanding: completion.understanding,
    evaluations: decision?.evaluations ?? [],
    decisiveAction: decision?.decisiveAction ?? null,
    guidingActions: decision?.guidingActions ?? [],
    traces: workspace.traces,
    derivedPriority: workspace.derivedPriority,
    outcome,
    shortCircuit: completion.shortCircuit,
    draftKind: workspace.draft?.kind ?? null,
    errorStage: completion.errorStage,
    usage: turn.usage,
  });
  const decisionId = await turn.deps.store.recordDecision(record).catch((error: unknown) => {
    console.error("[runTurn] não consegui gravar o DecisionRecord", error);
    return undefined;
  });
  await turn.reply.finish(completion.parts, decisionId);
}

/** Erro honesto (§10): texto em código, parte `error` com "Tentar de novo", `outcome: error`. */
async function finishWithError(
  turn: Turn,
  failure: { understanding: Understanding | null; decision: TurnDecision | null; stage: TurnStage },
  codeReply: CodeReply,
): Promise<void> {
  if (codeReply.text) {
    await write(turn, turn.replyText.trim() === "" ? codeReply.text : `\n\n${codeReply.text}`);
  }
  await complete(turn, {
    understanding: failure.understanding,
    decision: failure.decision,
    shortCircuit: false,
    errorStage: failure.stage,
    parts: codeReply.parts,
    usedReturnNote: false,
  });
}

function statePatch(turn: Turn, completion: Completion): TurnStatePatch {
  const { workspace, context } = turn;
  const previous = context.snapshot.conversation;
  const patch: TurnStatePatch = { ...context.summaryPatch };

  const shown = workspace.shownTickets();
  const focus =
    workspace.selectedTicketCode ??
    (shown.length === 1 ? shown[0] : null) ??
    workspace.focusedTicket?.code ??
    null;
  if (focus && focus !== previous.selectedTicketCode) patch.selectedTicketCode = focus;

  if (
    completion.decision &&
    completion.decision.clarificationAttempts !== previous.clarificationAttempts
  ) {
    patch.clarificationAttempts = completion.decision.clarificationAttempts;
  }
  if (completion.overdueOfferCode) {
    patch.pendingHandoffOffer = { reason: "overdue", ticketCode: completion.overdueOfferCode };
  } else if (previous.pendingHandoffOffer) {
    patch.pendingHandoffOffer = null;
  }
  if (completion.usedReturnNote) patch.clearReturnNote = true;
  return patch;
}

// ---------- Apoio ----------

async function write(turn: Turn, text: string): Promise<void> {
  turn.replyText += text;
  await turn.reply.write(text);
}

function addUsages(turn: Turn, model: string, usages: ModelUsage[]): void {
  for (const usage of usages) turn.usage = addModelUsage(turn.usage, model, usage);
}

function toolSession(turn: Turn, understanding: Understanding): ToolSession {
  return {
    now: turn.now,
    conversationId: turn.input.conversationId,
    employee: {
      name: turn.context.snapshot.employee.name,
      department: turn.context.snapshot.employee.department,
    },
    understanding,
    store: turn.deps.store,
    workspace: turn.workspace,
  };
}

/** O estado que o ENTENDER precisa ver (§6.2): rascunho pendente, foco e oferta pendente. */
function describeState(context: LoadedContext): string {
  const { conversation, pendingDraft } = context.snapshot;
  return [
    pendingDraft
      ? `Há um rascunho pendente (D-${pendingDraft.draftNumber}, ${pendingDraft.action.kind}).`
      : "Nenhum rascunho pendente.",
    conversation.selectedTicketCode
      ? `Chamado em foco: ${conversation.selectedTicketCode}.`
      : "Nenhum chamado em foco.",
    conversation.pendingHandoffOffer ? "O assistente acabou de oferecer chamar um analista." : null,
    context.rollingSummary ? `Resumo da conversa: ${context.rollingSummary}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** Consultar ou atualizar chamado não tem resposta honesta sem o serviço de chamados. */
function needsTicketsToAnswer(understanding: Understanding): boolean {
  return understanding.intent === "ticket_status" || understanding.intent === "update_ticket";
}

function hasOffer(actions: GuidingAction[], reason: "overdue" | "critical"): boolean {
  return actions.some((action) => action.kind === "offer_handoff" && action.reason === reason);
}

function overdueExplanation(decision: TurnDecision): string | null {
  const evaluation = decision.evaluations.find(
    (item) => item.name === "OverdueTicketPolicy" && item.outcome === "triggered",
  );
  return evaluation?.explanation ?? null;
}

/** Prioridade dos sinais do ENTENDER; um rascunho proposto no AGIR substitui depois. */
function derivedPriorityRecord(decision: TurnDecision, now: number) {
  if (!decision.derivedPriority) return null;
  const { priority, reason } = decision.derivedPriority;
  return { value: priority, reason, dueAt: computeDueAt(priority, now) };
}

function recentEmployeeTexts(context: LoadedContext): string[] {
  return context.history
    .filter((message) => message.role === "user")
    .slice(-3)
    .map((message) => message.content);
}
