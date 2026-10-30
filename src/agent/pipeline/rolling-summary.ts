import { Agent } from "@mastra/core/agent";

import type { LlmModels } from "@/agent/llm/provider";
import { SUMMARY_PROMPT } from "@/agent/prompts/summary-prompt";

import type { HistoryMessage } from "./agent-store";
import { toChatHistory } from "./history";
import type { ModelUsage } from "./turn-usage";

// Resumo acumulado (§6.7): junta o resumo anterior com as mensagens que ainda não entraram
// nele. Falhar aqui não pode derrubar o turno: devolve `null` e o resumo antigo continua.

const SUMMARY_TIMEOUT_MS = 8_000;

export async function summarizeConversation(options: {
  model: LlmModels["fast"];
  previousSummary: string | null;
  messages: HistoryMessage[];
}): Promise<{ summary: string; usage: ModelUsage } | null> {
  const transcript = toChatHistory(options.messages)
    .map(
      (message) => `${message.role === "user" ? "Funcionário" : "Assistente"}: ${message.content}`,
    )
    .join("\n");
  const request = [
    options.previousSummary ? `Resumo até aqui:\n${options.previousSummary}` : "",
    `Mensagens novas:\n${transcript}`,
  ]
    .filter((section) => section !== "")
    .join("\n\n");

  const agent = new Agent({
    id: "summarize",
    name: "summarize",
    instructions: SUMMARY_PROMPT,
    model: options.model,
    errorProcessorDefaults: false,
  });
  try {
    const out = await agent.generate([{ role: "user", content: request }], {
      providerOptions: { groq: { reasoningEffort: "low" } },
      modelSettings: { maxRetries: 1, temperature: 0, timeout: { totalMs: SUMMARY_TIMEOUT_MS } },
    });
    const summary = out.text.trim();
    return summary === "" ? null : { summary, usage: out.totalUsage };
  } catch (error) {
    console.warn("[summarizeConversation] resumo não atualizado", error);
    return null;
  }
}
