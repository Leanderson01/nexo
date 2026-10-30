import { describe, expect, it } from "vitest";

import {
  BLOCKED_QUESTION,
  DEADLINE_QUESTION,
  IMPACT_QUESTION,
  intakeQuestionIn,
  nextMissingSignal,
  readIntakeAnswer,
} from "../intake-questions";
import { findSignalSupport, sentenceSupports, verifySignals } from "../signal-evidence";

describe("sentenceSupports: o sinal só vale com uma frase que o diga", () => {
  it.each([
    ["impact", "team", "O sistema de vendas caiu para o time todo", true],
    ["impact", "team", "Atrapalha a equipe nas reuniões", true],
    ["impact", "team", "O Wi-Fi da sala 3 caiu de novo", false],
    ["impact", "company", "Parou para a empresa toda", true],
    ["impact", "individual", "Só eu estou com o problema", true],
    ["impact", "individual", "Minha senha do SAP bloqueou de novo", false],
    ["blocked", true, "não consigo trabalhar de casa sem ela", true],
    ["blocked", true, "Ninguém do Comercial consegue trabalhar e não temos alternativa", true],
    ["blocked", true, "O sistema de vendas caiu para o time todo", true],
    ["blocked", true, "O Wi-Fi da sala 3 caiu de novo", false],
    ["blocked", false, "dá para usar o cabo", true],
    ["blocked", false, "consigo abrir pelo navegador por enquanto", true],
    ["blocked", false, "Só eu, não consigo trabalhar", false],
    ["deadlineToday", true, "Tenho uma apresentação hoje às 15h", true],
    ["deadlineToday", true, "Só eu, não consigo trabalhar, sem compromisso hoje", false],
    ["deadlineToday", true, "não tenho nenhum compromisso hoje que dependa disso", false],
    ["deadlineToday", false, "Só eu, não consigo trabalhar, sem compromisso hoje", true],
    ["deadlineToday", false, "não tem nada urgente para hoje", true],
    ["deadlineToday", false, "caiu hoje cedo", false],
  ] as const)("%s = %s em %j: %s", (signal, value, sentence, expected) => {
    expect(sentenceSupports(signal, value, sentence)).toBe(expected);
  });
});

describe("findSignalSupport", () => {
  it("prefere a frase do trecho citado e cai para as outras frases do funcionário", () => {
    const texts = ["O Wi-Fi da sala 3 caiu.", "Atrapalha a equipe, mas dá para usar o cabo."];
    expect(findSignalSupport("impact", "team", texts, "caiu")).toBe(
      "Atrapalha a equipe, mas dá para usar o cabo",
    );
    expect(findSignalSupport("blocked", true, texts, "caiu")).toBeNull();
  });
});

describe("verifySignals", () => {
  it("descarta o que ninguém disse: Wi-Fi caiu não é equipe parada", () => {
    const verified = verifySignals({
      claimed: { impact: "team", blocked: true, deadlineToday: null },
      quotes: { impact: "O Wi-Fi da sala 3 caiu de novo", blocked: "caiu de novo" },
      answered: {},
      employeeTexts: ["O Wi-Fi da sala 3 caiu de novo"],
    });
    expect(verified.signals).toEqual({ impact: null, blocked: null, deadlineToday: null });
    expect(verified.dropped).toEqual([
      { signal: "impact", value: "team" },
      { signal: "blocked", value: "true" },
    ]);
  });

  it('"sem compromisso hoje" não vira compromisso', () => {
    const verified = verifySignals({
      claimed: { impact: "individual", blocked: true, deadlineToday: true },
      quotes: {},
      answered: {},
      employeeTexts: ["Só eu, não consigo trabalhar, sem compromisso hoje"],
    });
    // O true inventado sai e fica o que ele disse: sem compromisso.
    expect(verified.signals).toEqual({ impact: "individual", blocked: true, deadlineToday: false });
    expect(verified.dropped).toEqual([{ signal: "deadlineToday", value: "true" }]);
  });

  it("o modelo esqueceu num turno seguinte o que foi dito antes: vale a fala sem ambiguidade", () => {
    const verified = verifySignals({
      claimed: { impact: null, blocked: null, deadlineToday: null },
      quotes: {},
      answered: {},
      employeeTexts: [
        "Minha VPN dá erro 809. Só eu estou com o problema, não consigo trabalhar de casa sem ela e não tenho nenhum compromisso hoje que dependa disso.",
        "Windows 11",
      ],
    });
    expect(verified.signals).toEqual({ impact: "individual", blocked: true, deadlineToday: false });
  });

  it("a opção escolhida vale por si, acima do que o modelo leu", () => {
    const verified = verifySignals({
      claimed: { impact: "team", blocked: null, deadlineToday: null },
      quotes: {},
      answered: { impact: "individual", blocked: false },
      employeeTexts: ["Só eu", "Sim, dá para seguir"],
    });
    expect(verified.signals).toEqual({ impact: "individual", blocked: false, deadlineToday: null });
    expect(verified.dropped).toEqual([]);
  });
});

describe("perguntas de abertura em código", () => {
  it("pergunta uma coisa por vez e a urgência só quando muda a prioridade", () => {
    const none = { impact: null, blocked: null, deadlineToday: null };
    expect(nextMissingSignal(none)).toBe(IMPACT_QUESTION);
    expect(nextMissingSignal({ ...none, impact: "team" })).toBe(BLOCKED_QUESTION);
    expect(nextMissingSignal({ ...none, impact: "team", blocked: false })).toBe(DEADLINE_QUESTION);
    expect(nextMissingSignal({ ...none, impact: "team", blocked: true })).toBeNull();
  });

  it("lê a opção, o sim/não digitado e a frase que diz o impacto", () => {
    expect(readIntakeAnswer(IMPACT_QUESTION, "Minha equipe")).toBe("team");
    expect(readIntakeAnswer(IMPACT_QUESTION, "só eu mesmo")).toBe("individual");
    expect(readIntakeAnswer(IMPACT_QUESTION, "não sei")).toBeNull();
    expect(readIntakeAnswer(BLOCKED_QUESTION, "Sim, dá para seguir")).toBe(false);
    expect(readIntakeAnswer(BLOCKED_QUESTION, "não")).toBe(true);
    expect(readIntakeAnswer(BLOCKED_QUESTION, "consigo pelo celular")).toBe(false);
    expect(readIntakeAnswer(DEADLINE_QUESTION, "Não, pode esperar")).toBe(false);
    expect(readIntakeAnswer(DEADLINE_QUESTION, "sim, às 15h")).toBe(true);
    expect(readIntakeAnswer(DEADLINE_QUESTION, "não sei")).toBeNull();
  });

  it("reconhece a pergunta no texto do assistente", () => {
    expect(intakeQuestionIn(`Entendi. ${BLOCKED_QUESTION.question}`)).toBe(BLOCKED_QUESTION);
    expect(intakeQuestionIn("Qual é o seu Windows?")).toBeNull();
  });
});
