import { Agent } from "@mastra/core/agent";
import { MastraError } from "@mastra/core/error";

import type { LlmModels } from "@/agent/llm/provider";
import { schemaReminder, UNDERSTAND_PROMPT } from "@/agent/prompts/understand-prompt";
import type { Understanding } from "@/domain/understanding";

import type { ChatMessage } from "./history";
import type { ModelUsage } from "./turn-usage";
import { understandingSchema } from "./understanding-schema";

// ENTENDER (§6.2): modelo rápido com saída estruturada estrita, numa chamada separada do AGIR
// e sem tools (o Groq não combina as duas coisas). Saída fora do schema ganha uma nova
// tentativa com lembrete (§10, decisão 18); persistindo, o turno segue com confiança baixa.

export type UnderstandResult =
  | { ok: true; understanding: Understanding; usage: ModelUsage[]; schemaRetried: boolean }
  | { ok: false; error: unknown; usage: ModelUsage[] };

const UNDERSTAND_TIMEOUT_MS = 10_000;

/** Usado quando o modelo erra o schema duas vezes: vira esclarecimento ou transferência. */
export const FALLBACK_UNDERSTANDING: Understanding = {
  intent: "unclear",
  summary: "Não foi possível interpretar a mensagem.",
  entities: { system: null, errorCode: null, os: null, device: null, ticketRef: null },
  ticketSignals: { kind: null, category: null, impact: null, blocked: null, deadlineToday: null },
  missingFields: [],
  confidence: 0.3,
  confidenceReason: "A interpretação da mensagem falhou duas vezes.",
};

export async function understand(options: {
  model: LlmModels["fast"];
  history: ChatMessage[];
  /** Estado da conversa (rascunho pendente, chamado em foco) em texto. */
  stateNote: string;
}): Promise<UnderstandResult> {
  const agent = new Agent({
    id: "understand",
    name: "understand",
    instructions: `${UNDERSTAND_PROMPT}\n\nEstado da conversa:\n${options.stateNote}`,
    model: options.model,
    errorProcessorDefaults: false, // sem as retentativas escondidas do Mastra (mastra-api.md)
  });
  const usage: ModelUsage[] = [];

  const first = await generateUnderstanding(agent, options.history, usage);
  if (first.ok) return { ok: true, understanding: first.value, usage, schemaRetried: false };
  if (!isInvalidStructuredOutput(first.error)) return { ok: false, error: first.error, usage };

  const reminder: ChatMessage = { role: "user", content: schemaReminder(describe(first.error)) };
  const second = await generateUnderstanding(agent, [...options.history, reminder], usage);
  if (second.ok) return { ok: true, understanding: second.value, usage, schemaRetried: true };
  if (!isInvalidStructuredOutput(second.error)) return { ok: false, error: second.error, usage };

  console.warn("[understand] saída inválida duas vezes; segue com confiança baixa");
  return { ok: true, understanding: FALLBACK_UNDERSTANDING, usage, schemaRetried: true };
}

async function generateUnderstanding(
  agent: Agent,
  history: ChatMessage[],
  usage: ModelUsage[],
): Promise<{ ok: true; value: Understanding } | { ok: false; error: unknown }> {
  try {
    const out = await agent.generate(history, {
      structuredOutput: { schema: understandingSchema },
      providerOptions: { groq: { reasoningEffort: "low" } },
      modelSettings: { maxRetries: 1, temperature: 0, timeout: { totalMs: UNDERSTAND_TIMEOUT_MS } },
    });
    usage.push(out.totalUsage);
    return { ok: true, value: understandingSchema.parse(out.object) };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Saída fora do schema: o Mastra ou o Zod não validaram, ou o próprio Groq recusou o JSON
 * gerado (400 `json_validate_failed`, ex.: categoria fora do enum, medido na T6).
 */
export function isInvalidStructuredOutput(error: unknown): boolean {
  if (error instanceof MastraError && error.id === "STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED") {
    return true;
  }
  if (error instanceof Error && error.name === "ZodError") return true;
  return /json_validate_failed|does not match the expected schema/i.test(errorText(error));
}

/** Mensagens do erro e das causas, com o corpo da resposta do provedor quando houver. */
function errorText(error: unknown, depth = 0): string {
  if (!(error instanceof Error) || depth > 3) return "";
  const body =
    "responseBody" in error && typeof error.responseBody === "string" ? error.responseBody : "";
  return `${error.message} ${body} ${errorText(error.cause, depth + 1)}`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "saída inválida";
}
