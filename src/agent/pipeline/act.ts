import { Agent } from "@mastra/core/agent";

import type { LlmModels } from "@/agent/llm/provider";
import { ACT_PROMPT } from "@/agent/prompts/act-prompt";
import type { createTools } from "@/agent/tools/create-tools";
import { plainHyphens } from "@/shared/normalize-text";

import type { ChatMessage } from "./history";
import type { ModelUsage } from "./turn-usage";

// AGIR (§6.4): agent Mastra criado por requisição, sem memória (o histórico vem do Convex),
// com as tools do turno. O texto sai em pedaços para o streaming; as partes estruturadas
// ficam no `TurnWorkspace`. Regras do mastra-api.md: sem as retentativas escondidas do Mastra,
// uma retentativa do provedor (§10) e `stream` não lança (o erro vem em `out.error`).

/** Passos do loop: tool, tool, resposta... com folga para buscar, conferir e propor. */
const MAX_STEPS = 6;

export type ActResult =
  | { ok: true; text: string; usage: ModelUsage }
  | { ok: false; error: unknown; usage: ModelUsage | null };

export async function act(options: {
  model: LlmModels["main"];
  briefing: string;
  history: ChatMessage[];
  tools: ReturnType<typeof createTools>;
  onText: (piece: string) => Promise<void>;
  /** Encerra o loop depois do passo atual (ex.: o legado caiu e não adianta continuar). */
  shouldStop: () => boolean;
}): Promise<ActResult> {
  const agent = new Agent({
    id: "act",
    name: "act",
    instructions: `${ACT_PROMPT}\n\n${options.briefing}`,
    model: options.model,
    tools: options.tools,
    errorProcessorDefaults: false,
  });

  const out = await agent.stream(options.history, {
    maxSteps: MAX_STEPS,
    stopWhen: () => options.shouldStop(),
    providerOptions: { groq: { reasoningEffort: "low", parallelToolCalls: false } },
    modelSettings: { maxRetries: 1, timeout: { firstChunkMs: 15_000, totalMs: 45_000 } },
  });

  const writer = new StepAwareWriter(options.onText);
  for await (const chunk of out.fullStream) {
    if (chunk.type === "text-delta") await writer.write(cleanModelText(chunk.payload.text));
    if (chunk.type === "step-finish") writer.endStep();
  }

  if (out.error) return { ok: false, error: out.error, usage: await safeUsage(out.totalUsage) };
  return { ok: true, text: writer.text, usage: await out.totalUsage };
}

/** Hífen comum no lugar do tipográfico e sem o espaço de largura zero que o gpt-oss solta. */
function cleanModelText(piece: string): string {
  return plainHyphens(piece).replace(/\u200b/g, "");
}

/**
 * O texto de passos diferentes ("Vou verificar." e, depois da tool, "Seu chamado...") vem
 * colado no stream; aqui ganha um parágrafo entre eles.
 */
class StepAwareWriter {
  text = "";
  private stepEnded = false;

  constructor(private readonly onText: (piece: string) => Promise<void>) {}

  async write(piece: string): Promise<void> {
    const separator = this.stepEnded && this.text.trim() !== "" ? "\n\n" : "";
    this.stepEnded = false;
    const next = this.text === "" ? piece.trimStart() : separator + piece;
    if (next === "") return;
    this.text += next;
    await this.onText(next);
  }

  endStep(): void {
    this.stepEnded = true;
  }
}

async function safeUsage(usage: Promise<ModelUsage>): Promise<ModelUsage | null> {
  try {
    return await usage;
  } catch {
    return null;
  }
}
