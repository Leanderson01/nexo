import { describe, expect, test } from "vitest";

import { tidyTranscript } from "../punctuation";

describe("tidyTranscript", () => {
  test("põe maiúscula no começo e ponto no fim", () => {
    expect(tidyTranscript("minha vpn não conecta")).toBe("Minha vpn não conecta.");
  });

  test("tira espaços sobrando, quebras de linha e o espaço antes da pontuação", () => {
    expect(tidyTranscript("  meu notebook ,\n  travou  de novo !  ")).toBe(
      "Meu notebook, travou de novo!",
    );
  });

  test("mantém o ponto final, a exclamação e a interrogação que já vieram", () => {
    expect(tidyTranscript("Preciso de acesso ao SAP.")).toBe("Preciso de acesso ao SAP.");
    expect(tidyTranscript("cadê meu chamado?")).toBe("Cadê meu chamado?");
  });

  test("troca vírgula ou dois-pontos no fim por ponto", () => {
    expect(tidyTranscript("o erro é o 809,")).toBe("O erro é o 809.");
    expect(tidyTranscript("aparece assim:")).toBe("Aparece assim.");
  });

  test("maiúscula também depois de cada fim de frase", () => {
    expect(tidyTranscript("bom dia. minha impressora parou. dá pra ver?")).toBe(
      "Bom dia. Minha impressora parou. Dá pra ver?",
    );
  });

  test("não mexe em pontos dentro de endereços e números", () => {
    expect(tidyTranscript("o site vpn.nexo.com.br custa 2.5 segundos")).toBe(
      "O site vpn.nexo.com.br custa 2.5 segundos.",
    );
  });

  test("começa com acento ou número sem quebrar", () => {
    expect(tidyTranscript("é urgente")).toBe("É urgente.");
    expect(tidyTranscript("809 é o erro")).toBe("809 é o erro.");
  });

  test("áudio sem fala vira texto vazio", () => {
    expect(tidyTranscript("")).toBe("");
    expect(tidyTranscript("   ")).toBe("");
    expect(tidyTranscript(" ... ")).toBe("");
  });
});
