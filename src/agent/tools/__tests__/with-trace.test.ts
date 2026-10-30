import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { KnowledgeGateway } from "@/agent/gateways/knowledge-gateway";
import type { TicketGateway } from "@/agent/gateways/ticket-gateway";
import type { ToolCallTrace } from "@/domain/decision-record";

import type { AgentTool, GatewayAttempt, ToolGateways } from "../tool-session";
import { failureSummary, withTrace } from "../with-trace";

type Output = { ok: true; count: number };

/** Gateways cujo `listMine` relata as tentativas recebidas, como o HttpTicketGateway. */
function gatewaysReporting(attempts: GatewayAttempt[]) {
  return (onAttempt: (attempt: GatewayAttempt) => void): ToolGateways => ({
    tickets: {
      listMine: async () => {
        attempts.forEach(onAttempt);
        const last = attempts.at(-1);
        return last?.ok
          ? { ok: true, value: [] }
          : { ok: false, error: { kind: "unavailable", message: "instável" } };
      },
    } as unknown as TicketGateway,
    knowledge: {} as KnowledgeGateway,
  });
}

function listingTool(): AgentTool<{ onlyOpen: boolean }, Output> {
  return {
    name: "listMyTickets",
    label: "consultou seus chamados",
    description: "teste",
    inputSchema: z.object({ onlyOpen: z.boolean() }),
    describeInput: ({ onlyOpen }) => (onlyOpen ? "abertos" : "todos"),
    describeOutput: ({ count }) => `${count} chamados`,
    async run(_input, { tickets }) {
      const result = await tickets.listMine();
      return result.ok ? { ok: true, count: result.value.length } : { ok: false, error: "falhou" };
    },
  };
}

function clockFrom(times: number[]) {
  return () => times.shift() ?? 0;
}

describe("withTrace", () => {
  it("registra entrada, saída, latência e uma tentativa no sucesso", async () => {
    const traces: ToolCallTrace[] = [];
    const run = withTrace(listingTool(), {
      traces,
      openGateways: gatewaysReporting([{ ok: true }]),
      clock: clockFrom([100, 142]),
    });

    const output = await run({ onlyOpen: true });

    expect(output).toEqual({ ok: true, count: 0 });
    expect(traces).toEqual([
      {
        tool: "listMyTickets",
        label: "consultou seus chamados",
        inputSummary: "abertos",
        outputSummary: "0 chamados",
        status: "ok",
        attempts: 1,
        latencyMs: 42,
      },
    ]);
  });

  it("conta as tentativas do gateway e guarda o erro de cada uma (decisão 23)", async () => {
    const traces: ToolCallTrace[] = [];
    const run = withTrace(listingTool(), {
      traces,
      openGateways: gatewaysReporting([
        { ok: false, errorKind: "unavailable" },
        { ok: false, errorKind: "unavailable" },
        { ok: false, errorKind: "unavailable" },
      ]),
    });

    await run({ onlyOpen: false });

    expect(traces[0]).toMatchObject({
      status: "error",
      attempts: 3,
      outputSummary: "falhou",
      attemptErrors: ["unavailable", "unavailable", "unavailable"],
    });
  });

  it("exceção da tool vira erro para o modelo, sem derrubar o turno", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const traces: ToolCallTrace[] = [];
    const tool: AgentTool<{ onlyOpen: boolean }, Output> = {
      ...listingTool(),
      run: async () => {
        throw new Error("bug");
      },
    };

    const output = await withTrace(tool, { traces, openGateways: gatewaysReporting([]) })({
      onlyOpen: true,
    });

    expect(output.ok).toBe(false);
    expect(traces[0]).toMatchObject({
      status: "error",
      attempts: 1,
      outputSummary: "falha inesperada",
    });
  });
});

describe("failureSummary: o painel não mostra instruções ao modelo (QA R2)", () => {
  it.each([
    [
      "O sistema de chamados está instável e não respondeu depois de 3 tentativas. Não invente dados de chamados.",
      "O sistema de chamados está instável e não respondeu depois de 3 tentativas.",
    ],
    [
      "Ainda não dá para propor: falta saber quem é afetado. Não pergunte nada sobre isso: o sistema faz a pergunta. Escreva no máximo uma frase curta de acolhimento.",
      "Ainda não dá para propor: falta saber quem é afetado.",
    ],
    ["INC-20077 está aberto: use proposeTicketUpdate.", "INC-20077 está aberto."],
    ["Chame findSimilarTickets antes de propor um chamado novo.", "a ferramenta recusou a chamada"],
    ["Já há um rascunho proposto neste turno.", "Já há um rascunho proposto neste turno."],
  ])("%j → %j", (error, expected) => {
    expect(failureSummary(error)).toBe(expected);
  });
});
