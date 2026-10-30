import {
  categoryFromSpeech,
  impersonal,
  kindFromSpeech,
  titleConsistentWithSignals,
} from "../ticket-classification";
import { describe, expect, it } from "vitest";

import {
  buildTicketDescription,
  groundedSentence,
  impactSentence,
  saidOperatingSystem,
  TRIED_CUE,
  type DescriptionInput,
} from "../ticket-description";

const WIFI = ["O Wi-Fi da sala 3 caiu de novo"];

describe("groundedSentence: passar a limpo não é completar", () => {
  it("aceita a reescrita que cita o funcionário e não traz fato novo", () => {
    const result = groundedSentence(
      { text: "O Wi-Fi da sala 3 caiu novamente.", evidence: "Wi-Fi da sala 3 caiu de novo" },
      WIFI,
    );
    expect(result).toEqual({ sentence: "O Wi-Fi da sala 3 caiu novamente.", replaced: false });
  });

  it("troca pela fala do funcionário a reescrita que inventa fatos", () => {
    const result = groundedSentence(
      {
        text: "A queda foi percebida agora e impede o trabalho da equipe.",
        evidence: "O Wi-Fi da sala 3 caiu de novo",
      },
      WIFI,
    );
    expect(result).toEqual({ sentence: "O Wi-Fi da sala 3 caiu de novo.", replaced: true });
  });

  it("descarta a tentativa que o funcionário nunca contou", () => {
    expect(
      groundedSentence(
        { text: "Já tentei reinstalar o cliente.", evidence: "já tentei reinstalar" },
        ["Minha VPN está dando erro 809."],
        TRIED_CUE,
      ),
    ).toEqual({ sentence: null, replaced: true });
    expect(
      groundedSentence(
        { text: "Não foram feitas tentativas.", evidence: "O Wi-Fi da sala 3 caiu de novo" },
        WIFI,
        TRIED_CUE,
      ),
    ).toEqual({ sentence: null, replaced: true });
  });
});

describe("buildTicketDescription", () => {
  const base: DescriptionInput = {
    symptom: { text: "A VPN apresenta o erro 809 ao conectar.", evidence: "erro 809" },
    since: null,
    tried: null,
    articlesTried: [],
    signals: { impact: "individual", blocked: true, deadlineToday: null },
    operatingSystem: null,
    employeeTexts: ["Minha VPN está dando erro 809 ao conectar.", "Windows 10", "Não"],
    fallbackSymptom: "Minha VPN está dando erro 809 ao conectar",
  };

  it("monta sintoma, artigo tentado, impacto e ambiente, sem fatos inventados", () => {
    const built = buildTicketDescription({
      ...base,
      tried: { text: "Já reinstalou o cliente.", evidence: "reinstalei o cliente" },
      articlesTried: ["VPN com erro 809"],
      operatingSystem: "Windows 10",
    });
    expect(built.description).toBe(
      'A VPN apresenta o erro 809 ao conectar. O artigo "VPN com erro 809" da central de ajuda já foi tentado, sem resolver. Afeta apenas o solicitante; impede o trabalho, sem alternativa no momento. Sistema operacional: Windows 10.',
    );
    expect(built.corrected).toEqual(["o que já foi tentado"]);
  });

  it("usa a fala do funcionário quando o sintoma não se sustenta", () => {
    const built = buildTicketDescription({
      ...base,
      symptom: { text: "Erro 809 no Windows 11.", evidence: "erro 809 no windows 11" },
    });
    // A fala dele entra impessoal (QA R1): "Minha VPN" vira "A VPN".
    expect(built.description.startsWith("A VPN está dando erro 809 ao conectar.")).toBe(true);
  });
});

describe("ticket-classification (QA R1)", () => {
  it.each([
    [["O monitor externo não liga."], "INC"],
    [["Meu teclado está com várias teclas falhando"], "INC"],
    [["Quero abrir um chamado: o Excel trava toda vez que abro a planilha."], "INC"],
    [["Preciso de acesso ao Figma"], "REQ"],
    [["Gostaria de um segundo monitor para o home office"], "REQ"],
    [["Qual o status do meu chamado?"], null],
  ] as const)("%j → %s", (texts, expected) => {
    expect(kindFromSpeech([...texts])).toBe(expected);
  });

  it("sistema de vendas em Outros vira Software; as outras categorias ficam", () => {
    expect(categoryFromSpeech("other", ["O sistema de vendas caiu para o time todo"])).toBe(
      "software",
    );
    expect(categoryFromSpeech("other", ["A cadeira quebrou"])).toBe("other");
    expect(categoryFromSpeech("hardware", ["o sistema da impressora"])).toBe("hardware");
  });

  it("título não diz que o trabalho parou quando a pessoa disse que dá para seguir", () => {
    const canWork = { impact: "individual", blocked: false, deadlineToday: false } as const;
    expect(titleConsistentWithSignals("Teclado com teclas falhando impede trabalho", canWork)).toBe(
      "Teclado com teclas falhando",
    );
    expect(
      titleConsistentWithSignals("Teclado com teclas falhando impede trabalho", {
        ...canWork,
        blocked: true,
      }),
    ).toBe("Teclado com teclas falhando impede trabalho");
    expect(titleConsistentWithSignals("Monitor externo não liga", canWork)).toBe(
      "Monitor externo não liga",
    );
  });

  it("descrição impessoal", () => {
    expect(impersonal("O microfone do meu headset não funciona.")).toBe(
      "O microfone do headset não funciona.",
    );
    expect(impersonal("Minha VPN dá erro e já tentei reiniciar o meu notebook.")).toBe(
      "A VPN dá erro e já tentou reiniciar o notebook.",
    );
    expect(impersonal("Não consigo imprimir.")).toBe("Não consegue imprimir.");
  });
});

describe("impactSentence e saidOperatingSystem", () => {
  it("descreve só os sinais conferidos", () => {
    expect(impactSentence({ impact: null, blocked: null, deadlineToday: null })).toBeNull();
    expect(impactSentence({ impact: "team", blocked: false, deadlineToday: true })).toBe(
      "Afeta a equipe; há alternativa para seguir trabalhando por enquanto. Há compromisso hoje que depende disso.",
    );
  });

  it("o sistema operacional precisa ter sido dito", () => {
    expect(saidOperatingSystem("Windows 10", ["Minha VPN dá erro 809"])).toBeNull();
    expect(saidOperatingSystem("Windows 11", ["Windows 11"])).toBe("Windows 11");
    expect(saidOperatingSystem("Windows 11", ["uso o win11"])).toBe("Windows 11");
    expect(saidOperatingSystem("Não sei", ["Não sei"])).toBeNull();
  });
});
