import { describe, expect, test } from "vitest";

import { pickBrazilianVoice, speakableText } from "../speech";

const voice = (name: string, lang: string, isDefault = false) => ({
  name,
  lang,
  default: isDefault,
});

describe("pickBrazilianVoice", () => {
  test("prefere a voz pt-BR padrão do sistema", () => {
    const voices = [
      voice("Google US English", "en-US", true),
      voice("Luciana", "pt-BR"),
      voice("Maria", "pt-BR", true),
    ];
    expect(pickBrazilianVoice(voices)?.name).toBe("Maria");
  });

  test("aceita as grafias pt_BR e pt-br; sem padrão pt-BR, a primeira", () => {
    expect(pickBrazilianVoice([voice("Joana", "pt-PT"), voice("Felipe", "pt_BR")])?.name).toBe(
      "Felipe",
    );
    expect(pickBrazilianVoice([voice("Luciana", "pt-br")])?.name).toBe("Luciana");
  });

  test("sem voz pt-BR (nem a de Portugal serve), null: o botão some", () => {
    expect(pickBrazilianVoice([voice("Joana", "pt-PT"), voice("Alex", "en-US", true)])).toBeNull();
    expect(pickBrazilianVoice([])).toBeNull();
  });
});

describe("speakableText", () => {
  test("lê só os textos, sem os cards e as opções rápidas", () => {
    expect(
      speakableText([
        { type: "text", text: "Encontrei um chamado seu. " },
        { type: "ticket", code: "INC-20311" },
        { type: "text", text: "Quer complementar?" },
        { type: "quickReplies", options: [{ label: "Sim", value: "sim" }] },
      ]),
    ).toBe("Encontrei um chamado seu. Quer complementar?");
  });

  test("mensagem só com cards não tem o que ler", () => {
    expect(speakableText([{ type: "ticket", code: "INC-20311" }])).toBe("");
  });
});
