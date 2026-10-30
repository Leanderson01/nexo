import { describe, expect, test } from "vitest";

import { confirmationFailureReply, confirmationReplyText } from "../draft-replies";

// Quarta, 28/10/2026, 10:00 em São Paulo (UTC-3).
const WEDNESDAY_10H = Date.parse("2026-10-28T13:00:00Z");
// Sexta, 30/10/2026, 17:00 em São Paulo.
const FRIDAY_17H = Date.parse("2026-10-30T20:00:00Z");

describe("confirmationReplyText", () => {
  test("Alta no meio do expediente: prazo no mesmo dia", () => {
    const text = confirmationReplyText(
      "create_ticket",
      { code: "INC-20431", priority: "HIGH", lastActivityAt: WEDNESDAY_10H },
      { now: WEDNESDAY_10H, criticalHandoff: false },
    );

    expect(text).toBe(
      "Pronto, abri o INC-20431. A primeira resposta do suporte vem até hoje, 14:00 (4 horas úteis).",
    );
  });

  test("Alta na sexta às 17h: prazo vai para segunda às 11h (§13.1)", () => {
    const text = confirmationReplyText(
      "reopen_ticket",
      { code: "INC-20150", priority: "HIGH", lastActivityAt: FRIDAY_17H },
      { now: FRIDAY_17H, criticalHandoff: false },
    );

    expect(text).toBe(
      "Pronto, reabri o INC-20150. O atendimento recomeça, e o suporte responde até 02 nov, 11:00 (4 horas úteis).",
    );
  });

  test("crítico avisa que um analista vai assumir", () => {
    const text = confirmationReplyText(
      "create_ticket",
      { code: "INC-20431", priority: "CRITICAL", lastActivityAt: FRIDAY_17H },
      { now: FRIDAY_17H, criticalHandoff: true },
    );

    expect(text).toContain("hoje, 18:00 (1 hora corrida)");
    expect(text).toContain("um analista do plantão vai assumir esta conversa");
  });
});

describe("confirmationFailureReply", () => {
  test("instabilidade pode ser repetida; recusa não", () => {
    expect(confirmationFailureReply({ kind: "unavailable", message: "instável" }).retryable).toBe(
      true,
    );
    expect(confirmationFailureReply({ kind: "conflict", message: "Chamado fechado" })).toEqual({
      message:
        "O sistema de chamados não aceitou o pedido: Chamado fechado. Você pode editar ou cancelar o rascunho.",
      retryable: false,
    });
  });
});
