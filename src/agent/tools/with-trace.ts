import type { ToolCallTrace } from "@/domain/decision-record";
import type { GatewayErrorKind } from "@/domain/enums";

import type {
  AgentTool,
  GatewayAttempt,
  OpenGateways,
  ToolFailure,
  ToolSuccess,
} from "./tool-session";

// Decorator da §5.8: embrulha a execução de uma tool e registra, sem a tool escrever log à
// mão, a entrada e a saída resumidas, a latência, o status e as tentativas feitas nos
// gateways (inclusive o erro de cada tentativa que falhou, decisão 23).

export interface TraceEnvironment {
  traces: ToolCallTrace[];
  openGateways: OpenGateways;
  clock?: () => number;
}

const UNEXPECTED_ERROR = "Falha inesperada na ferramenta. Não tente de novo neste turno.";

/** Resumos ficam curtos: o painel mostra uma linha por chamada. */
const SUMMARY_MAX_LENGTH = 240;

export function withTrace<Input, Output extends ToolSuccess>(
  tool: AgentTool<Input, Output>,
  environment: TraceEnvironment,
): (input: Input) => Promise<Output | ToolFailure> {
  const clock = environment.clock ?? (() => performance.now());

  return async (input) => {
    const attempts: GatewayAttempt[] = [];
    const gateways = environment.openGateways((attempt) => attempts.push(attempt));
    const startedAt = clock();

    let output: Output | ToolFailure;
    let outputSummary: string;
    try {
      output = await tool.run(input, gateways);
      outputSummary = output.ok ? tool.describeOutput(output) : output.error;
    } catch (error) {
      console.error(`[withTrace] ${tool.name} lançou`, error);
      output = { ok: false, error: UNEXPECTED_ERROR };
      outputSummary = "falha inesperada";
    }

    environment.traces.push({
      tool: tool.name,
      label: tool.label,
      inputSummary: shorten(tool.describeInput(input)),
      outputSummary: shorten(outputSummary),
      status: output.ok ? "ok" : "error",
      // Tools sem gateway (opções rápidas, seletor) contam como uma execução.
      attempts: Math.max(1, attempts.length),
      latencyMs: Math.round(clock() - startedAt),
      ...attemptErrorsOf(attempts),
    });
    return output;
  };
}

function attemptErrorsOf(attempts: GatewayAttempt[]): { attemptErrors?: GatewayErrorKind[] } {
  const errors = attempts.flatMap((attempt) => (attempt.errorKind ? [attempt.errorKind] : []));
  return errors.length > 0 ? { attemptErrors: errors } : {};
}

function shorten(text: string): string {
  if (text.length <= SUMMARY_MAX_LENGTH) return text;
  return `${text.slice(0, SUMMARY_MAX_LENGTH - 1)}…`;
}
