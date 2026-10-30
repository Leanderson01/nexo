import { describe, expect, it } from "vitest";

import type { DecisionRecord } from "@/domain/decision-record";
import type { MessagePart } from "@/domain/message-parts";

import {
  observeFinalState,
  observeStep,
  sumUsage,
  type ConversationSnapshot,
  type SnapshotDecision,
  type SnapshotMessage,
  type SnapshotTicket,
} from "../observation";

// ---------- Fábricas ----------

function message(
  id: string,
  role: SnapshotMessage["role"],
  parts: MessagePart[],
  createdAt: number,
): SnapshotMessage {
  return { _id: id, role, parts, createdAt };
}

function decisionRow(messageId: string, costUsd = 0.001): SnapshotDecision {
  const record: DecisionRecord = {
    understanding: null,
    policies: [],
    actions: [],
    confidence: { value: 0.9, level: "high", reason: "claro" },
    rationale: "",
    outcome: "handoff",
    usage: {
      models: [],
      inputTokens: 1000,
      outputTokens: 100,
      estimatedCostUsd: costUsd,
      latencyMs: 0,
    },
    createdAt: 0,
  };
  return {
    ...record,
    _id: `decision-${messageId}`,
    _creationTime: 0,
    conversationId: "c1",
    messageId,
  };
}

function ticket(code: string, createdAt: number): SnapshotTicket {
  return {
    code,
    kind: "INC",
    category: "software",
    priority: "CRITICAL",
    title: "Sistema fora",
    description: "Caiu para todos",
    createdAt,
  };
}

function snapshot(overrides: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    conversation: { status: "agent" },
    messages: [],
    decisions: [],
    pendingActions: [],
    employeeTickets: [],
    ...overrides,
  };
}

const userAsks = message("m1", "user", [{ type: "text", text: "Quero falar com uma pessoa." }], 10);

// ---------- Passo ----------

describe("observeStep", () => {
  it("junta a resposta do agent e a mensagem system da transferência", () => {
    const after = snapshot({
      messages: [
        userAsks,
        message("m2", "assistant", [{ type: "text", text: "Vou chamar um analista." }], 11),
        message("m3", "system", [{ type: "handoff", reason: "requested", outOfHours: false }], 12),
      ],
      decisions: [decisionRow("m2")],
    });

    const observed = observeStep(new Set(), after);

    expect(observed.reply?.text).toBe("Vou chamar um analista.");
    expect(observed.reply?.parts.map((part) => part.type)).toEqual(["text", "handoff"]);
    expect(observed.decision?.outcome).toBe("handoff");
    expect(observed.decision).not.toHaveProperty("messageId");
  });

  it("ignora mensagens de passos anteriores e as do funcionário", () => {
    const earlier = message("m0", "assistant", [{ type: "text", text: "Resposta antiga" }], 5);
    const after = snapshot({
      messages: [
        earlier,
        userAsks,
        message("m2", "assistant", [{ type: "text", text: "Nova" }], 11),
      ],
      decisions: [decisionRow("m0"), decisionRow("m2")],
    });

    const observed = observeStep(new Set(["m0"]), after);

    expect(observed.reply?.text).toBe("Nova");
    expect(observed.decision).not.toBeNull();
    expect(observeStep(new Set(["m0", "m1", "m2"]), after)).toEqual({
      reply: null,
      decision: null,
    });
  });

  it("concatena os pedaços de texto de uma mensagem e separa mensagens por parágrafo", () => {
    const after = snapshot({
      messages: [
        message(
          "m2",
          "assistant",
          [
            { type: "text", text: "Chamado registrado. " },
            { type: "text", text: "Prazo: 4 horas." },
          ],
          11,
        ),
        message("m3", "system", [{ type: "text", text: "Transferido." }], 12),
      ],
    });

    expect(observeStep(new Set(), after).reply?.text).toBe(
      "Chamado registrado. Prazo: 4 horas.\n\nTransferido.",
    );
  });

  it("lê espaços inseparáveis como espaço comum, para os padrões de texto casarem", () => {
    const after = snapshot({
      messages: [
        message("m2", "assistant", [{ type: "text", text: "prazo de 3\u202Fdias\u00A0úteis" }], 11),
      ],
    });

    expect(observeStep(new Set(), after).reply?.text).toBe("prazo de 3 dias úteis");
  });

  it("botão do rascunho: resposta sem DecisionRecord", () => {
    const after = snapshot({
      messages: [message("m2", "assistant", [{ type: "ticket", code: "INC-20500" }], 11)],
    });

    const observed = observeStep(new Set(), after);

    expect(observed.decision).toBeNull();
    expect(observed.reply?.parts).toEqual([{ type: "ticket", code: "INC-20500" }]);
  });
});

// ---------- Fim do cenário ----------

describe("observeFinalState", () => {
  it("lê status, motivo da transferência e o rascunho mais recente", () => {
    const final = observeFinalState(
      snapshot({
        conversation: { status: "waiting_analyst", handoff: { reason: "critical" } },
        pendingActions: [
          {
            _id: "p2",
            action: { kind: "reopen_ticket", code: "INC-20150", reason: "de novo" },
            status: "pending",
            createdAt: 20,
          },
          {
            _id: "p1",
            action: { kind: "update_ticket", code: "INC-20395", text: "continua" },
            status: "superseded",
            createdAt: 10,
          },
        ],
      }),
      new Set(),
    );

    expect(final.conversationStatus).toBe("waiting_analyst");
    expect(final.handoffReason).toBe("critical");
    expect(final.proposedAction).toEqual({
      action: { kind: "reopen_ticket", code: "INC-20150", reason: "de novo" },
      status: "pending",
    });
  });

  it("chamados criados são os que não existiam antes, em ordem de criação", () => {
    const final = observeFinalState(
      snapshot({
        employeeTickets: [ticket("INC-20502", 30), ticket("INC-20077", 1), ticket("INC-20501", 20)],
      }),
      new Set(["INC-20077"]),
    );

    expect(final.ticketsCreated.map((created) => created.code)).toEqual(["INC-20501", "INC-20502"]);
    expect(final.handoffReason).toBeNull();
    expect(final.proposedAction).toBeNull();
  });

  it("o que foi gravado inclui mensagens, decisões e rascunhos", () => {
    const final = observeFinalState(
      snapshot({
        messages: [message("m1", "user", [{ type: "text", text: "senha ********" }], 1)],
        decisions: [decisionRow("m2")],
        pendingActions: [
          {
            _id: "p1",
            action: { kind: "update_ticket", code: "INC-20395", text: "texto do rascunho" },
            status: "pending",
            createdAt: 1,
          },
        ],
      }),
      new Set(),
    );

    expect(final.storedTexts).toHaveLength(3);
    expect(final.storedTexts.join("\n")).toContain("senha ********");
    expect(final.storedTexts.join("\n")).toContain("texto do rascunho");
    expect(final.storedTexts.join("\n")).not.toContain("decision-m2");
  });
});

// ---------- Custo ----------

describe("sumUsage", () => {
  it("soma tokens e custo de cada turno", () => {
    const total = sumUsage([decisionRow("a", 0.0012), decisionRow("b", 0.0003)]);

    expect(total).toMatchObject({ turns: 2, inputTokens: 2000, outputTokens: 200 });
    expect(total.costUsd).toBeCloseTo(0.0015, 10);
  });

  it("sem turnos, tudo zero", () => {
    expect(sumUsage([])).toEqual({ turns: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
  });
});
