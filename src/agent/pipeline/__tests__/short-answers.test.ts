import { describe, expect, it } from "vitest";

import { makeUnderstanding } from "@/agent/policies/__tests__/fixtures";
import type { MessagePart } from "@/domain/message-parts";

import { applyShortAnswerRules, describePickedReply, findPickedReply } from "../short-answers";
import { assistantMessage, userMessage } from "./fakes";

function options(...labels: string[]): MessagePart {
  return { type: "quickReplies", options: labels.map((label) => ({ label, value: label })) };
}

const ASKED_WINDOWS = [
  userMessage("Minha VPN dá erro 809."),
  assistantMessage([
    { type: "text", text: "Qual é o seu Windows?" },
    options("Windows 10", "Windows 11", "Não sei"),
  ]),
  userMessage("Windows 11"),
];

const ASKED_IF_IT_WORKED = [
  userMessage("Minha VPN dá erro 809."),
  assistantMessage([
    { type: "text", text: "Reinstale o cliente de VPN e reinicie. Isso resolveu?" },
    options("Sim", "Não"),
  ]),
  userMessage("Não"),
];

describe("findPickedReply", () => {
  it("acha a opção oferecida na resposta anterior, com a pergunta", () => {
    const picked = findPickedReply(ASKED_WINDOWS, "Windows 11");
    expect(picked).toEqual({ label: "Windows 11", question: "Qual é o seu Windows?" });
    expect(describePickedReply(picked!)).toContain("herda o assunto em andamento");
  });

  it("texto digitado que não é uma das opções não conta", () => {
    expect(findPickedReply(ASKED_WINDOWS, "Uso Linux")).toBeNull();
    expect(findPickedReply([userMessage("Windows 11")], "Windows 11")).toBeNull();
  });
});

describe("applyShortAnswerRules", () => {
  it("opção rápida escolhida tem confiança alta e segue o assunto em andamento", () => {
    const understood = makeUnderstanding({ intent: "unclear", confidence: 0.6 });
    const result = applyShortAnswerRules(understood, ASKED_WINDOWS, "Windows 11");
    expect(result).toMatchObject({ intent: "question", confidence: 0.9 });
    expect(result.confidenceReason).toContain("Windows 11");
  });

  it('"Não" a "Isso resolveu?" segue para o chamado, com confiança alta', () => {
    const understood = makeUnderstanding({ intent: "unclear", confidence: 0.3 });
    const result = applyShortAnswerRules(understood, ASKED_IF_IT_WORKED, "Não");
    expect(result).toMatchObject({ intent: "open_ticket", confidence: 0.9 });
    expect(result.confidenceReason).toContain("Isso resolveu?");
  });

  it('vale para um "não" digitado, mantendo o resto do que foi entendido', () => {
    const understood = makeUnderstanding({ intent: "question", summary: "VPN com erro 809" });
    const result = applyShortAnswerRules(understood, ASKED_IF_IT_WORKED, "não resolveu, continua");
    expect(result).toMatchObject({ intent: "open_ticket", summary: "VPN com erro 809" });
  });

  it("não mexe em mensagem digitada fora das regras", () => {
    const understood = makeUnderstanding({ intent: "unclear", confidence: 0.3 });
    expect(applyShortAnswerRules(understood, ASKED_IF_IT_WORKED, "Nossa, que demora")).toBe(
      understood,
    );
    expect(applyShortAnswerRules(understood, ASKED_WINDOWS, "Não sei direito")).toBe(understood);
    expect(applyShortAnswerRules(understood, ASKED_IF_IT_WORKED, "Não sei").intent).toBe("unclear");
  });

  it("mantém a intenção que o ENTENDER já deu à opção escolhida", () => {
    const understood = makeUnderstanding({ intent: "open_ticket", confidence: 0.6 });
    expect(applyShortAnswerRules(understood, ASKED_WINDOWS, "Windows 11").intent).toBe(
      "open_ticket",
    );
  });

  it("não baixa a confiança que já era alta", () => {
    const understood = makeUnderstanding({ intent: "question", confidence: 0.95 });
    expect(applyShortAnswerRules(understood, ASKED_WINDOWS, "Windows 11")).toBe(understood);
  });
});
