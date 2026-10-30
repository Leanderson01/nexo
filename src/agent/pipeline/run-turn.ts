import type { ConvexHttpClient } from "convex/browser";

import type { GuidingAction } from "@/agent/policies/run-policies";
import { buildTurnBriefing } from "@/agent/prompts/turn-briefing";
import { createTools } from "@/agent/tools/create-tools";
import { listMyTicketsTool } from "@/agent/tools/list-my-tickets";
import type { ToolSession } from "@/agent/tools/tool-session";
import { withTrace, type TraceEnvironment } from "@/agent/tools/with-trace";
import type { ReplyCorrection } from "@/domain/decision-record";
import type { TurnStage } from "@/domain/enums";
import type { MessagePart } from "@/domain/message-parts";
import { computeDueAt } from "@/domain/sla";
import type { Understanding } from "@/domain/understanding";

import type { Id } from "../../../convex/_generated/dataModel";
import { act } from "./act";
import { applyShortAnswerRules, describePickedReply, findPickedReply } from "./short-answers";
import type { TurnStatePatch } from "./agent-store";
import {
  buildHandoffSummary,
  LEGACY_UNAVAILABLE_REPLY,
  MODEL_FAILURE_REPLY,
  overdueOfferText,
  sensitiveDataNotice,
  shortCircuitReply,
  type CodeReply,
} from "./code-replies";
import { consultKnowledge, shouldConsultKnowledge } from "./consult-knowledge";
import { consultSimilar, shouldConsultSimilar } from "./consult-similar";
import { buildReturnContext, loadContext, type LoadedContext } from "./context-loader";
import { ACCEPT_HANDOFF_OFFER, decide, DECLINE_HANDOFF_OFFER, type TurnDecision } from "./decide";
import { resolveFocus, type FocusResult } from "./focus";
import { handOffToAnalyst } from "./hand-off";
import { buildDecisionRecord } from "./record";
import {
  checkTicketCodes,
  draftRetryInstruction,
  draftRetryReason,
  EMPTY_REPLY_RETRY_INSTRUCTION,
  extractQuickRepliesFromText,
  extractTicketCodes,
  isEmptyReply,
  isNoTicketFound,
  offerToOpenTicket,
  removeToolCallsFromText,
  resolveDraftRetry,
  quickRepliesRetryInstruction,
  resolveEmptyReply,
  resolveQuickRepliesRetry,
  retrySucceeded,
  saysNotFound,
} from "./reply-checks";
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
import { readConversationFacts, type ConversationFacts } from "./conversation-facts";
import { applyReturnNoteRules } from "./return-note";
import { continueIntake, verifyUnderstanding } from "./verify-understanding";
import {
  ARTICLE_QUESTION,
  classifyQuestion,
  closedQuestionOptions,
  correction,
  inapplicableArticleSentence,
  intakeText,
  keepOneQuestion,
  looksLikeArticleAnswer,
  questionsIn,
  stripMarkdown,
  withCodeQuestion,
  withFinalQuestion,
  withoutQuestions,
  YES_NO,
} from "./reply-conduct";
import { replyUsesNote, RETURN_NOTE_RETRY_INSTRUCTION } from "./return-note";
import { nextMissingSignal } from "@/domain/intake-questions";
import { problemStatement } from "@/domain/ticket-description";

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

/** Novas tentativas do AGIR quando o texto promete um rascunho que não foi proposto. */
const MAX_DRAFT_RETRIES = 2;

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
  /** Onde começa o texto do modelo em `replyText` (antes dele, só o aviso de dado sensível). */
  modelTextStart: number;
  /** Texto final quando uma conferência trocou o que já foi transmitido (decisão 25). */
  replacementText: string | null;
  /** Correções feitas em código depois do AGIR, para o `DecisionRecord`. */
  corrections: ReplyCorrection[];
  /** O que a conversa mostra de fato (falas do funcionário, opções escolhidas, artigos). */
  facts: ConversationFacts;
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
  await deps.store.markUserMessage("delivered");

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
    modelTextStart: 0,
    replacementText: null,
    corrections: [],
    facts: readConversationFacts(context.snapshot.recentMessages, input.userText),
  };

  const notice = sensitiveDataNotice(input.userText);
  if (notice) await write(turn, `${notice}\n\n`);

  // ENTENDER
  const understood = await understand({
    model: deps.llm.models.fast,
    history: context.history,
    stateNote: describeState(context, input.userText),
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
  await deps.store.markUserMessage("read");
  // Resposta curta a uma pergunta do assistente: regras em código (short-answers.ts).
  const shortAnswered = applyShortAnswerRules(
    understood.understanding,
    context.snapshot.recentMessages,
    input.userText,
  );
  // Sinais e sistema operacional só valem com evidência na fala do funcionário.
  const verified = verifyUnderstanding(
    continueIntake(shortAnswered, turn.facts),
    understood.signalQuotes,
    turn.facts,
  );
  turn.corrections.push(...verified.corrections);
  // Primeiro turno depois da devolução: a nota do analista é o contexto da mensagem.
  const { understanding } = applyReturnNoteRules(
    verified.understanding,
    input.userText,
    context.snapshot.conversation.returnNote,
  );

  // Chamado em foco (decisão 2) e DECIDIR
  const session = toolSession(turn, understanding);
  const traceEnvironment: TraceEnvironment = {
    traces: turn.workspace.traces,
    openGateways: turn.gateways.openForTool,
  };
  const focus = await resolveFocus({
    understanding,
    userText: input.userText,
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
          // "Sim, chamar um analista" não é o pedido: o problema vem da fala do funcionário.
          requestSummary: understanding.intent === "talk_to_analyst" ? null : understanding.summary,
          rollingSummary: turn.context.rollingSummary,
          ticketCode,
          recentEmployeeTexts: recentEmployeeTexts(turn.context),
          problem: reportedProblem(turn.facts),
          consulted: consultedSoFar(turn),
          ticketCodes: turn.facts.shownTicketCodes,
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

  // Problema que voltou com um chamado parecido: o caminho é o chamado anterior (F4), então a
  // central não entra no contexto (o modelo seguia o artigo em vez do parecido).
  const similarTickets = shouldConsultSimilar(understanding, turn.input.userText)
    ? await consultSimilar(session, traceEnvironment)
    : null;
  // Respondendo às perguntas da abertura, o artigo já ficou para trás: a central não entra.
  const articles =
    shouldConsultKnowledge(understanding) &&
    !similarTickets?.length &&
    !workspace.legacyUnavailable &&
    !turn.facts.answeredIntakeNow
      ? await consultKnowledge(session, traceEnvironment)
      : null;
  if (workspace.legacyUnavailable) {
    await finishWithError(
      turn,
      { understanding, decision, stage: "act" },
      LEGACY_UNAVAILABLE_REPLY,
    );
    return;
  }
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
    articles,
    similarTickets,
    sensitiveNoticeWritten: turn.replyText !== "",
  });

  const runAct = (extraInstruction: string | null, onText: (piece: string) => Promise<void>) =>
    act({
      model: turn.deps.llm.models.main,
      briefing: extraInstruction ? `${briefing}\n\n${extraInstruction}` : briefing,
      history: context.history,
      tools: createTools(session, traceEnvironment),
      onText,
      shouldStop: () => workspace.legacyUnavailable,
    });

  turn.modelTextStart = turn.replyText.length;
  const acted = await runAct(null, (piece) => write(turn, piece));
  if (acted.usage) addUsages(turn, turn.deps.llm.mainModel, [acted.usage]);
  if (!(await actSucceeded(turn, acted, { understanding, decision }))) return;

  // Conferências em código depois do AGIR (decisão 25).
  // Regra 5: sem texto e sem partes, uma nova tentativa (em streaming, nada foi mostrado) e,
  // falhando, um aviso honesto; nunca um balão vazio.
  if (isEmptyReply({ text: modelText(turn), hasParts: hasStructuredParts(workspace) })) {
    const retried = await runAct(EMPTY_REPLY_RETRY_INSTRUCTION, (piece) => write(turn, piece));
    if (retried.usage) addUsages(turn, turn.deps.llm.mainModel, [retried.usage]);
    if (workspace.legacyUnavailable) replaceModelText(turn, "");
    if (!(await actSucceeded(turn, retried, { understanding, decision }, false))) return;
    const resolved = resolveEmptyReply({
      retryOk: retried.ok,
      retryText: modelText(turn),
      retryHasParts: hasStructuredParts(workspace),
    });
    if (resolved.fallback) {
      replaceModelText(turn, resolved.fallback.text);
      workspace.offerQuickReplies(resolved.fallback.quickReplies);
    }
    turn.corrections.push(resolved.correction);
  }

  const retryReason = draftRetryReason({
    text: modelText(turn),
    draftProposed: workspace.draft !== null,
    pendingDraftExists: context.snapshot.pendingDraft !== null,
    otherCardShown: otherCardShown(workspace),
    criticalCase: workspace.criticalCase,
  });
  if (retryReason) {
    let previousText = modelText(turn);
    let retryText: string | null = null;
    for (let attempt = 1; attempt <= MAX_DRAFT_RETRIES; attempt++) {
      let text = "";
      const instruction = draftRetryInstruction({
        reason: retryReason,
        previousText,
        similarConsulted: workspace.similarTickets !== null,
      });
      const retried = await runAct(instruction, async (piece) => {
        text += piece;
      });
      if (retried.usage) addUsages(turn, turn.deps.llm.mainModel, [retried.usage]);
      if (workspace.legacyUnavailable) replaceModelText(turn, "");
      if (!(await actSucceeded(turn, retried, { understanding, decision }, false))) return;
      retryText = retried.ok ? text : null;
      const state = {
        reason: retryReason,
        retryText,
        draftProposed: workspace.draft !== null,
        otherCardShown: otherCardShown(workspace),
      };
      if (retrySucceeded(state)) break;
      if (retryText) previousText = retryText;
    }
    const resolved = resolveDraftRetry({
      reason: retryReason,
      retryText,
      draftProposed: workspace.draft !== null,
      otherCardShown: otherCardShown(workspace),
    });
    replaceModelText(turn, resolved.text);
    turn.corrections.push(resolved.correction);
  }

  // Regra 4: chamada de tool escrita como texto não chega ao funcionário.
  const withoutToolCalls = removeToolCallsFromText(
    modelText(turn),
    workspace.quickReplyLabels() !== null,
  );
  if (withoutToolCalls) {
    replaceModelText(turn, withoutToolCalls.text);
    if (withoutToolCalls.quickReplies) workspace.offerQuickReplies(withoutToolCalls.quickReplies);
    turn.corrections.push(withoutToolCalls.correction);
  }
  // Regra 6: opções escritas como texto saem do texto e viram a parte de opções; anunciadas
  // sem rótulos e sem a tool, uma nova tentativa do AGIR pede a tool.
  const writtenOptions = extractQuickRepliesFromText({
    text: modelText(turn),
    toolQuickReplies: workspace.quickReplyLabels(),
  });
  if (writtenOptions) {
    let resolved = { text: writtenOptions.text, correction: writtenOptions.correction };
    if (writtenOptions.quickReplies) workspace.offerQuickReplies(writtenOptions.quickReplies);
    if (writtenOptions.missingOptions) {
      let text = "";
      const retried = await runAct(quickRepliesRetryInstruction(modelText(turn)), async (piece) => {
        text += piece;
      });
      if (retried.usage) addUsages(turn, turn.deps.llm.mainModel, [retried.usage]);
      if (workspace.legacyUnavailable) replaceModelText(turn, "");
      if (!(await actSucceeded(turn, retried, { understanding, decision }, false))) return;
      resolved = resolveQuickRepliesRetry({
        first: writtenOptions,
        retryText: retried.ok ? text : null,
        retryQuickReplies: workspace.quickReplyLabels(),
      });
    }
    replaceModelText(turn, resolved.text);
    turn.corrections.push(resolved.correction);
  }

  // As opções da oferta de analista são fixas em código (decisão 22 lê a resposta).
  if (overdueOffer) {
    workspace.offerQuickReplies([ACCEPT_HANDOFF_OFFER, DECLINE_HANDOFF_OFFER]);
    // O prazo vencido é explicado em código, com a mesma base do card (QA: o texto dizia
    // "4 dias" e o card "há 6 dias").
    replaceModelText(turn, overdueOfferText(overdueOffer, turn.now));
  }
  // Condução em código (QA C1): perguntas conhecidas com texto e opções daqui, uma por turno.
  const basedOnArticle = await conductReply(turn, {
    understanding,
    overdueOffer: overdueOffer !== null,
    runAct,
    ok: (acted) => actSucceeded(turn, acted, { understanding, decision }, false),
  });
  if (basedOnArticle === null) return;
  if (workspace.correctedDescriptionFields.length > 0) {
    turn.corrections.push(
      correction(
        "invented_description",
        `O rascunho trazia ${workspace.correctedDescriptionFields.join(", ")} sem apoio na fala do funcionário; ficou o que ele disse (§11.2: passar a limpo não é completar).`,
      ),
    );
  }

  await checkCitedTicketCodes(turn, session, traceEnvironment);
  await offerToOpenWhenNoTicket(turn, understanding, focus);
  tidyMarkdown(turn);

  // A nota do analista só sai depois de um turno que a usou (QA C1, bloqueante 4).
  const returnNote = context.snapshot.conversation.returnNote;
  let usedReturnNote = returnNote !== null && replyUsesNote(modelText(turn), returnNote);
  if (returnNote !== null && !usedReturnNote && workspace.draft === null) {
    let text = "";
    const retried = await runAct(RETURN_NOTE_RETRY_INSTRUCTION, async (piece) => {
      text += piece;
    });
    if (retried.usage) addUsages(turn, turn.deps.llm.mainModel, [retried.usage]);
    if (!(await actSucceeded(turn, retried, { understanding, decision }, false))) return;
    usedReturnNote = retried.ok && replyUsesNote(text, returnNote);
    if (usedReturnNote) {
      replaceModelText(turn, stripMarkdown(text).trim());
      workspace.clearQuickReplies();
    }
    turn.corrections.push(
      correction(
        "return_note",
        usedReturnNote
          ? "A resposta não usou a nota do analista; uma nova tentativa do AGIR respondeu com base nela."
          : "A resposta não usou a nota do analista nem na nova tentativa; a nota fica para o próximo turno.",
      ),
    );
  }

  await complete(turn, {
    understanding,
    decision,
    shortCircuit: false,
    errorStage: null,
    parts: workspace.structuredParts({ includeArticle: basedOnArticle }),
    usedReturnNote,
    overdueOfferCode: overdueOffer?.code ?? null,
  });
}

// ---------- Condução em código (QA C1) ----------

type RunAct = (
  extraInstruction: string | null,
  onText: (piece: string) => Promise<void>,
) => ReturnType<typeof act>;

/** Intenções em que a resposta pode estar abrindo um chamado. */
const INTAKE_INTENTS: readonly Understanding["intent"][] = [
  "question",
  "open_ticket",
  "update_ticket",
  "unclear",
  "confirm_or_edit_draft",
];

const SIGNALS_COMPLETE_INSTRUCTION = `## Correção (decidida em código)
Impacto, bloqueio e urgência já foram informados pelo funcionário. Não pergunte mais nada: chame findSimilarTickets (se ainda não chamou neste turno) e a tool de proposta que o parecido indicar (proposeTicketDraft, proposeTicketUpdate ou proposeReopen) agora, e peça para conferir e confirmar no card.`;

/**
 * Conferências da condução depois do AGIR. Devolve se a resposta se baseia no artigo (o card
 * entra), ou `null` quando o turno já terminou com erro.
 */
async function conductReply(
  turn: Turn,
  options: {
    understanding: Understanding;
    overdueOffer: boolean;
    runAct: RunAct;
    ok: (acted: Awaited<ReturnType<typeof act>>) => Promise<boolean>;
  },
): Promise<boolean | null> {
  const { workspace } = turn;
  const { understanding } = options;
  const showsOtherContent =
    workspace.draft !== null ||
    workspace.handoff !== null ||
    workspace.shownTickets().length > 0 ||
    workspace.hasTicketSelector() ||
    options.overdueOffer;

  // Condição do artigo (F1): "Qual é o seu Windows?" com as opções dela, sempre coerentes.
  if (workspace.conditionQuestion && !showsOtherContent) {
    const { question, options: labels } = workspace.conditionQuestion;
    const text = modelText(turn);
    const fixed = withCodeQuestion(text, question);
    if (fixed !== text.trim()) {
      replaceModelText(turn, fixed);
      turn.corrections.push(
        correction(
          "condition_question",
          `A pergunta da condição do artigo saiu com o texto definido em código ("${question}").`,
        ),
      );
    }
    workspace.offerQuickReplies(labels);
    return false;
  }

  // Artigo que vale (F1 passos 3 e 4): card do artigo e "Isso resolveu?" com Sim e Não.
  const top = workspace.topArticle;
  if (
    top?.status === "applies" &&
    !showsOtherContent &&
    understanding.intent !== "ticket_status" &&
    looksLikeArticleAnswer(modelText(turn))
  ) {
    const text = modelText(turn);
    const fixed = withFinalQuestion(text, ARTICLE_QUESTION);
    if (fixed !== text.trim()) {
      replaceModelText(turn, fixed);
      turn.corrections.push(
        correction(
          "article_answer",
          `A resposta seguiu o artigo "${top.part.title}" sem terminar em "Isso resolveu?": a pergunta, o card e as opções Sim e Não entraram em código.`,
        ),
      );
    }
    workspace.applicableArticle = top.part;
    workspace.offerQuickReplies(YES_NO);
    return true;
  }

  // Abertura de chamado (F4): a próxima pergunta que falta, com texto e opções definidos aqui.
  if (!showsOtherContent && isIntakeTurn(turn, understanding)) {
    const { impact, blocked, deadlineToday } = understanding.ticketSignals;
    const next = nextMissingSignal({ impact, blocked, deadlineToday });
    if (next) {
      const text = modelText(turn);
      replaceModelText(turn, intakeText(next, turn.facts.previousAskedIntake));
      workspace.offerQuickReplies(next.options.map((option) => option.label));
      turn.corrections.push(
        correction(
          "intake_question",
          `Falta saber ${next.signal} para abrir o chamado: a pergunta "${next.question}" e as opções saíram em código no lugar de "${text.trim().slice(0, 160)}".`,
        ),
      );
      return false;
    }
    if (workspace.draft === null) {
      // Sinais completos e nenhum rascunho: uma nova tentativa pede a proposta.
      let text = "";
      workspace.clearQuickReplies();
      const retried = await options.runAct(SIGNALS_COMPLETE_INSTRUCTION, async (piece) => {
        text += piece;
      });
      if (retried.usage) addUsages(turn, turn.deps.llm.mainModel, [retried.usage]);
      if (!(await options.ok(retried))) return null;
      if (workspace.draft !== null && retried.ok && text.trim() !== "") {
        replaceModelText(turn, text.trim());
      }
      turn.corrections.push(
        correction(
          "intake_question",
          workspace.draft !== null
            ? "Os sinais já estavam completos e o AGIR perguntou de novo; uma nova tentativa propôs o rascunho."
            : "Os sinais já estavam completos e o AGIR perguntou de novo; nem a nova tentativa propôs o rascunho.",
        ),
      );
      if (workspace.draft !== null) return false;
    }
  }

  // Sistema operacional sem artigo que dependa dele: a pergunta sai (QA: SO para teclado).
  const osQuestions = questionsIn(modelText(turn)).filter(
    (question) => classifyQuestion(question) === "os",
  );
  if (osQuestions.length > 0) {
    replaceModelText(turn, withoutQuestionsMatching(modelText(turn), osQuestions));
    if (workspace.quickReplyLabels()?.some((label) => /windows|mac|linux/i.test(label))) {
      workspace.clearQuickReplies();
    }
    turn.corrections.push(
      correction(
        "one_question",
        "A resposta perguntava o sistema operacional sem nenhum artigo que dependa dele; a pergunta saiu.",
      ),
    );
  }

  // O seletor de chamados já traz a pergunta: o texto não repete.
  if (workspace.hasTicketSelector() && questionsIn(modelText(turn)).length > 0) {
    const fixed = withoutQuestions(modelText(turn)) || "Encontrei mais de um chamado seu.";
    replaceModelText(turn, fixed);
    turn.corrections.push(
      correction("one_question", "A pergunta do texto repetia a do seletor de chamados e saiu."),
    );
  }

  // Uma pergunta por turno (§6.4): fica a última.
  const single = keepOneQuestion(modelText(turn));
  if (single) {
    replaceModelText(turn, single.text);
    turn.corrections.push(
      correction(
        "one_question",
        `A resposta fazia mais de uma pergunta; ficou só a última (saiu: ${single.removed.map((question) => `"${question}"`).join(", ")}).`,
      ),
    );
  }

  // Pergunta fechada sem opções (decisão 31): Sim e Não.
  const closed =
    workspace.quickReplyLabels() === null &&
    workspace.draft === null &&
    !workspace.hasTicketSelector()
      ? closedQuestionOptions(modelText(turn))
      : null;
  if (closed) {
    workspace.offerQuickReplies(closed);
    turn.corrections.push(
      correction(
        "closed_question_options",
        "A pergunta fechada saiu sem opções; Sim e Não entraram em código.",
      ),
    );
  }

  // Artigo que não vale para o caso (F1): o funcionário fica sabendo por quê.
  if (top?.status === "does_not_apply") {
    const sentence = inapplicableArticleSentence(modelText(turn), {
      title: top.part.title,
      appliesTo: top.appliesTo,
      knownValue: top.knownValue,
    });
    if (sentence) replaceModelText(turn, `${sentence} ${modelText(turn).trim()}`.trim());
  }
  return false;
}

/**
 * O turno está abrindo um chamado novo: a tool de rascunho foi recusada por falta de sinais, o
 * assistente fez uma pergunta da abertura no turno anterior, ou o modelo perguntou impacto,
 * bloqueio, urgência ou (num problema) o sistema operacional.
 */
function isIntakeTurn(turn: Turn, understanding: Understanding): boolean {
  const { workspace, context, facts } = turn;
  if (context.snapshot.pendingDraft !== null || workspace.conditionQuestion) return false;
  if (!INTAKE_INTENTS.includes(understanding.intent)) return false;

  const refusedForSignals = workspace.traces.some(
    (trace) =>
      trace.tool === "proposeTicketDraft" &&
      trace.status === "error" &&
      trace.outputSummary.includes("falta saber"),
  );
  if (refusedForSignals || facts.previousAskedIntake) return true;

  const asked = questionsIn(modelText(turn)).map(classifyQuestion);
  if (asked.some((kind) => kind === "impact" || kind === "blocked" || kind === "deadlineToday")) {
    return true;
  }
  const isProblem =
    understanding.intent === "open_ticket" || understanding.ticketSignals.kind === "INC";
  return isProblem && asked.includes("os");
}

/** Tira do texto as perguntas indicadas (as demais frases ficam). */
function withoutQuestionsMatching(text: string, questions: string[]): string {
  let result = text;
  for (const question of questions) result = result.replace(question, "");
  return result
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Markdown cru (`>`, `**`, `#`) não chega ao funcionário: o chat não renderiza. */
function tidyMarkdown(turn: Turn): void {
  const text = modelText(turn);
  const clean = stripMarkdown(text);
  if (clean === text) return;
  replaceModelText(turn, clean);
  turn.corrections.push(correction("markdown_removed", "O texto tinha markdown cru e foi limpo."));
}

/**
 * Falha do AGIR (legado fora do ar ou modelo): termina com o erro honesto e devolve `false`.
 * Na nova tentativa, a falha do modelo não encerra o turno: a conferência responde honesto.
 */
async function actSucceeded(
  turn: Turn,
  acted: Awaited<ReturnType<typeof act>>,
  state: { understanding: Understanding; decision: TurnDecision },
  modelFailureEndsTurn = true,
): Promise<boolean> {
  if (turn.workspace.legacyUnavailable) {
    await finishWithError(turn, { ...state, stage: "act" }, LEGACY_UNAVAILABLE_REPLY);
    return false;
  }
  if (!acted.ok && modelFailureEndsTurn) {
    console.error("[runTurn] AGIR falhou", acted.error);
    await finishWithError(turn, { ...state, stage: "act" }, MODEL_FAILURE_REPLY);
    return false;
  }
  if (!acted.ok) console.warn("[runTurn] nova tentativa do AGIR falhou", acted.error);
  return true;
}

/** Regra 1 (decisão 25): todo código citado no texto ou nas opções é do funcionário. */
async function checkCitedTicketCodes(
  turn: Turn,
  session: ToolSession,
  traceEnvironment: TraceEnvironment,
): Promise<void> {
  const { workspace } = turn;
  const text = modelText(turn);
  const quickReplies = workspace.quickReplyLabels();
  const cited = extractTicketCodes([text, ...(quickReplies ?? [])].join("\n"));
  if (cited.length === 0) return;

  // Os códigos só são conferidos contra o serviço de chamados (a lista do próprio funcionário).
  if (!workspace.employeeTickets) {
    await withTrace(listMyTicketsTool(session), traceEnvironment)({ onlyOpen: null });
  }
  const checked = checkTicketCodes({ text, quickReplies, ownCodes: ownTicketCodes(workspace) });
  if (!checked) return;
  if (checked.text !== text) replaceModelText(turn, checked.text);
  if (checked.quickReplies) workspace.offerQuickReplies(checked.quickReplies);
  else workspace.clearQuickReplies();
  turn.corrections.push(checked.correction);
}

/** Regra 3 (decisão 25, F2): nenhum chamado encontrado informa e oferece abrir um. */
async function offerToOpenWhenNoTicket(
  turn: Turn,
  understanding: Understanding,
  focus: FocusResult,
): Promise<void> {
  const { workspace } = turn;
  const text = modelText(turn);
  const ownCodes = ownTicketCodes(workspace);
  const noTicketFound = isNoTicketFound({
    intent: understanding.intent,
    ticketReference:
      understanding.entities.ticketRef ??
      understanding.entities.device ??
      understanding.entities.system,
    ticketsConsulted: workspace.employeeTickets !== null,
    focusedOrAmbiguous:
      focus.resolution.focusedTicket !== null || focus.resolution.ambiguousCandidates.length > 1,
    showedOwnTicket:
      workspace.shownTickets().length > 0 ||
      workspace.hasTicketSelector() ||
      workspace.draft !== null ||
      extractTicketCodes(text).some((code) => ownCodes.has(code)),
    saysNotFound: saysNotFound(text),
  });
  if (!noTicketFound) return;

  const offer = offerToOpenTicket(text);
  workspace.offerQuickReplies(offer.quickReplies);
  if (offer.correction) turn.corrections.push(offer.correction);
  if (offer.text === text) return;
  // A oferta acrescentada continua o streaming; a troca do texto entra no fim.
  if (offer.text.startsWith(text) && turn.replacementText === null) {
    await write(turn, offer.text.slice(text.length));
  } else {
    replaceModelText(turn, offer.text);
  }
}

/** A resposta já tem alguma parte (card, seletor, rascunho ou opções). O artigo só entra com texto. */
function hasStructuredParts(workspace: TurnWorkspace): boolean {
  return workspace.structuredParts({ includeArticle: false }).length > 0;
}

/** A resposta pode mostrar card de chamado, de artigo ou seletor ("confira o card" sobre eles). */
function otherCardShown(workspace: TurnWorkspace): boolean {
  return (
    workspace.shownTickets().length > 0 ||
    workspace.hasTicketSelector() ||
    workspace.applicableArticle !== null
  );
}

function ownTicketCodes(workspace: TurnWorkspace): Set<string> {
  return new Set([
    ...(workspace.employeeTickets ?? []).map((ticket) => ticket.code),
    ...(workspace.similarTickets?.keys() ?? []),
  ]);
}

/** O que o modelo escreveu neste turno (sem o aviso de dado sensível do começo). */
function modelText(turn: Turn): string {
  return turn.replyText.slice(turn.modelTextStart);
}

/** Troca o texto do modelo; o aviso do começo fica e a troca vai junto com a conclusão. */
function replaceModelText(turn: Turn, text: string): void {
  turn.replyText = turn.replyText.slice(0, turn.modelTextStart) + text;
  turn.replacementText = turn.replyText;
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
      (decision?.guidingActions.some((action) => action.kind === "ask_clarification") ?? false) ||
      (workspace.askedArticleCondition && !shownContent),
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
    corrections: turn.corrections,
  });
  const decisionId = await turn.deps.store.recordDecision(record).catch((error: unknown) => {
    console.error("[runTurn] não consegui gravar o DecisionRecord", error);
    return undefined;
  });
  await turn.reply.finish(completion.parts, decisionId, turn.replacementText ?? undefined);
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
  // Depois de uma troca, o que vier entra também no texto que substitui o transmitido.
  if (turn.replacementText !== null) turn.replacementText = turn.replyText;
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
    facts: {
      employeeTexts: turn.facts.employeeTexts,
      articlesTried: turn.facts.articlesTried,
    },
    store: turn.deps.store,
    workspace: turn.workspace,
  };
}

/** O estado que o ENTENDER precisa ver (§6.2): rascunho pendente, foco, oferta e opção escolhida. */
function describeState(context: LoadedContext, userText: string): string {
  const { conversation, pendingDraft } = context.snapshot;
  const picked = findPickedReply(context.snapshot.recentMessages, userText);
  return [
    pendingDraft
      ? `Há um rascunho pendente (D-${pendingDraft.draftNumber}, ${pendingDraft.action.kind}).`
      : "Nenhum rascunho pendente.",
    conversation.selectedTicketCode
      ? `Chamado em foco: ${conversation.selectedTicketCode}.`
      : "Nenhum chamado em foco.",
    conversation.pendingHandoffOffer ? "O assistente acabou de oferecer chamar um analista." : null,
    conversation.returnNote
      ? `O analista acabou de devolver a conversa ao assistente com esta nota: "${conversation.returnNote}". Mensagens sobre o que o analista fez ("E aí, conseguiu?", "e então?") são sobre essa nota: intent question, confiança alta; não é pedido de analista.`
      : null,
    context.rollingSummary ? `Resumo da conversa: ${context.rollingSummary}` : null,
    picked ? describePickedReply(picked) : null,
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

/** A fala em que o funcionário contou o problema (a mais longa da janela), se houver. */
function reportedProblem(facts: ConversationFacts): string | null {
  const problem = problemStatement(facts.employeeTexts, "");
  return problem.trim() === "" ? null : problem;
}

/** O que já foi consultado, mostrado e tentado na conversa, para o analista não repetir. */
function consultedSoFar(turn: Turn): string[] {
  const { facts, workspace } = turn;
  return [
    ...new Set([
      ...workspace.traces.filter((trace) => trace.status === "ok").map((trace) => trace.label),
      ...facts.shownArticles.map((title) =>
        facts.articlesTried.includes(title)
          ? `artigo "${title}" tentado, sem resolver`
          : `artigo "${title}" mostrado`,
      ),
    ]),
  ];
}

function recentEmployeeTexts(context: LoadedContext): string[] {
  return context.history
    .filter((message) => message.role === "user")
    .slice(-3)
    .map((message) => message.content);
}
