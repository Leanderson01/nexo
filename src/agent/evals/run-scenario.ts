import type { ConvexHttpClient } from "convex/browser";

import { readLlmConfig } from "@/agent/llm/models";
import { createLlmModels } from "@/agent/llm/provider";
import { runTurn, type RunTurnInput } from "@/agent/pipeline/run-turn";
import { createTurnDependencies, type TurnDependencies } from "@/agent/pipeline/turn-dependencies";
import { cancelDraft } from "@/features/drafts/cancel-draft";
import { confirmDraft } from "@/features/drafts/confirm-draft";
import { readDraftServerConfig } from "@/features/drafts/server-config";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { checkScenario } from "./check-scenario";
import {
  applyDeploymentEnv,
  observeConversation as observe,
  resetForScenario,
  signInAs,
  type EvalConfig,
} from "./eval-environment";
import type { ScenarioRun } from "./eval-report";
import {
  NO_USAGE,
  observeFinalState,
  observeStep,
  sumUsage,
  type ConversationSnapshot,
} from "./observation";
import type { ObservedStep, Scenario, ScenarioStep } from "./scenario";
import { transcriptLines } from "./transcript";

// Executa um cenário contra o agent real, pelo mesmo caminho do produto:
//
// - mensagem: `sendUserMessage` como o funcionário + `runTurn` com as dependências reais.
//   É exatamente o que a rota POST .../messages faz (ela só acrescenta o `after()` do Next);
//   aqui esperamos o turno terminar em vez de acompanhar o streaming;
// - Confirmar/Cancelar: os serviços da T11 que as rotas do rascunho chamam.
//
// A única troca é o `fetch` do LLM, que espera e repete no 429 (decisão 17).

export interface ScenarioRunnerOptions {
  config: EvalConfig;
  /** `fetch` do provedor de LLM (com a espera no 429). */
  llmFetch: typeof fetch;
  /** O Convex expira o turno em 60 s; passado isso, o runner desiste do passo. */
  turnTimeoutMs: number;
}

export async function runScenario(
  scenario: Scenario,
  options: ScenarioRunnerOptions,
): Promise<ScenarioRun> {
  const startedAt = Date.now();
  const summary = { id: scenario.id, title: scenario.title, source: scenario.source };

  await resetForScenario(options.config, scenario.employeeEmail);
  const restoreEnv = applyDeploymentEnv(scenario.setup?.env);
  try {
    const { failures, snapshot, transcript } = await executeSteps(scenario, options);
    return {
      scenario: summary,
      failures,
      transcript,
      usage: sumUsage(snapshot.decisions),
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      scenario: summary,
      failures: [`Runner: ${errorMessage(error)}`],
      transcript: [],
      usage: NO_USAGE,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    restoreEnv();
  }
}

// ---------- Passos ----------

interface StepContext {
  options: ScenarioRunnerOptions;
  convex: ConvexHttpClient;
  conversationId: Id<"conversations">;
  snapshot: ConversationSnapshot;
}

async function executeSteps(
  scenario: Scenario,
  options: ScenarioRunnerOptions,
): Promise<{ failures: string[]; snapshot: ConversationSnapshot; transcript: string[] }> {
  const convex = await signInAs(options.config.convexUrl, scenario.employeeEmail);
  const created = await convex.mutation(api.conversations.create, {});
  if (!created.ok) throw new Error(`não consegui criar a conversa (${created.error}).`);
  const conversationId = created.value.conversationId;

  let snapshot = await observe(options.config, conversationId);
  const ticketCodesBefore = new Set(snapshot.employeeTickets.map((ticket) => ticket.code));
  const stepProblems: string[] = [];
  const steps: ObservedStep[] = [];

  for (const [index, step] of scenario.steps.entries()) {
    const messageIdsBefore = new Set(snapshot.messages.map((message) => message._id));
    const problem = await executeStep(step, { options, convex, conversationId, snapshot });
    snapshot = await observe(options.config, conversationId);
    steps.push(observeStep(messageIdsBefore, snapshot));
    if (problem) {
      stepProblems.push(`Passo ${index + 1}: ${problem.message}`);
      if (problem.stop) break;
    }
  }

  const failures = checkScenario(scenario, {
    steps,
    final: observeFinalState(snapshot, ticketCodesBefore),
  });
  const transcript = steps.flatMap((observed, index) =>
    transcriptLines(scenario.steps[index], observed),
  );
  return { failures: [...stepProblems, ...failures], snapshot, transcript };
}

/** O passo não pôde ser executado como o roteiro pede; `stop` encerra o cenário. */
interface StepProblem {
  message: string;
  stop: boolean;
}

async function executeStep(step: ScenarioStep, context: StepContext): Promise<StepProblem | null> {
  switch (step.kind) {
    case "message":
      return await sendMessage(step.text, context);
    case "confirmDraft":
    case "cancelDraft":
      return await clickDraftButton(step.kind, context);
  }
}

async function sendMessage(text: string, context: StepContext): Promise<StepProblem | null> {
  const { convex, conversationId, options } = context;
  const sent = await convex.mutation(api.messages.sendUserMessage, { conversationId, text });
  if (!sent.ok) return { message: `a mensagem foi recusada (${sent.error}).`, stop: true };
  // Conversa com analista: a mensagem só é salva, sem turno do agent (igual à rota).
  if (!sent.value.assistantMessageId) return null;

  const input: RunTurnInput = {
    conversationId: sent.value.conversationId,
    assistantMessageId: sent.value.assistantMessageId,
    userText: sent.value.savedText,
    convex,
    agentSecret: options.config.agentSecret,
  };
  const finished = await withTimeout(
    runTurn(input, { dependencies: evalDependencies(input, options.llmFetch) }),
    options.turnTimeoutMs,
  );
  if (finished) return null;
  return { message: `o turno passou de ${options.turnTimeoutMs / 1000} s.`, stop: true };
}

/** As dependências do produto, com o `fetch` do LLM que espera no 429. */
function evalDependencies(input: RunTurnInput, llmFetch: typeof fetch): TurnDependencies {
  const product = createTurnDependencies(input);
  const models = createLlmModels(readLlmConfig(process.env), llmFetch);
  return { ...product, llm: { ...product.llm, models } };
}

/** O botão do card de rascunho: age sobre o rascunho pendente da conversa. */
async function clickDraftButton(
  kind: "confirmDraft" | "cancelDraft",
  context: StepContext,
): Promise<StepProblem | null> {
  const { convex, conversationId, snapshot, options } = context;
  const pendingActionId = snapshot.conversation.pendingActionId;
  if (!pendingActionId) {
    return { message: "o botão não existe: não há rascunho pendente na conversa.", stop: false };
  }

  const draftConfig = readDraftServerConfig();
  if (!draftConfig) throw new Error("falta configuração do servidor para os rascunhos.");
  const result =
    kind === "confirmDraft"
      ? await confirmDraft({
          convex,
          agentSecret: options.config.agentSecret,
          createGateway: draftConfig.createGateway,
          conversationId,
          pendingActionId,
        })
      : await cancelDraft({
          convex,
          agentSecret: options.config.agentSecret,
          conversationId,
          pendingActionId,
        });
  if (result.ok) return null;
  const button = kind === "confirmDraft" ? "Confirmar" : "Cancelar";
  return { message: `o ${button} do rascunho devolveu erro (${result.error}).`, stop: false };
}

// ---------- Apoio ----------

/** Verdadeiro se a promessa terminou dentro do prazo. */
async function withTimeout(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([promise.then(() => true), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
