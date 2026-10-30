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
  problemStatement,
  saidOperatingSystem,
  titleCitingProblem,
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
    quickAnswers: ["Windows 10", "Não"],
    problemText: "Minha VPN está dando erro 809 ao conectar.",
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

describe("o sintoma vem da mensagem em que o problema foi contado (R3, F1 Windows 11)", () => {
  const WIN11_TEXTS = [
    "Minha VPN dá erro 809",
    "Windows 11",
    "Só eu",
    "Sim, dá para seguir",
    "Sim, tenho compromisso hoje",
  ];
  const WIN11_ANSWERS = WIN11_TEXTS.slice(1);
  const win11: DescriptionInput = {
    symptom: { text: "Tem compromisso hoje.", evidence: "tenho compromisso hoje" },
    since: { text: "Desde hoje.", evidence: "Sim, tenho compromisso hoje" },
    tried: null,
    articlesTried: [],
    signals: { impact: "individual", blocked: false, deadlineToday: true },
    operatingSystem: "Windows 11",
    employeeTexts: WIN11_TEXTS,
    quickAnswers: WIN11_ANSWERS,
    problemText: problemStatement(WIN11_TEXTS, "", WIN11_ANSWERS),
  };

  it("a mensagem do problema é a digitada, mesmo curta, e nunca uma opção escolhida", () => {
    expect(problemStatement(WIN11_TEXTS, "resumo", WIN11_ANSWERS)).toBe("Minha VPN dá erro 809");
    expect(problemStatement(["Bom dia, preciso de ajuda", "Minha VPN dá erro 809"], "")).toBe(
      "Minha VPN dá erro 809",
    );
    expect(problemStatement(["Sim, tenho compromisso hoje"], "resumo", WIN11_ANSWERS)).toBe(
      "resumo",
    );
  });

  it("sintoma tirado de uma opção escolhida vira a mensagem do problema", () => {
    const built = buildTicketDescription(win11);
    expect(built.description).toBe(
      "A VPN dá erro 809. Afeta apenas o solicitante; há alternativa para seguir trabalhando por enquanto. Há compromisso hoje que depende disso. Sistema operacional: Windows 11.",
    );
    expect(built.corrected).toEqual(["sintoma", "desde quando"]);
  });

  it("sintoma do modelo fica quando cita a mensagem do problema", () => {
    const built = buildTicketDescription({
      ...win11,
      symptom: { text: "A VPN dá erro 809.", evidence: "VPN dá erro 809" },
      since: null,
    });
    expect(built.description.startsWith("A VPN dá erro 809.")).toBe(true);
    expect(built.corrected).toEqual([]);
  });

  it("o título sempre cita o problema", () => {
    expect(titleCitingProblem("Erro 809 na VPN no Windows 11", "Minha VPN dá erro 809")).toBe(
      "Erro 809 na VPN no Windows 11",
    );
    expect(titleCitingProblem("Compromisso hoje em risco", "Minha VPN dá erro 809")).toBe(
      "Minha VPN dá erro 809",
    );
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
