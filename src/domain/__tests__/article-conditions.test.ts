import { describe, expect, test } from "vitest";

import type { Article } from "../article";
import { checkArticleConditions, normalizeConditionValue } from "../article-conditions";
import { devicesConflict } from "../devices";

const vpn809: Pick<Article, "conditions"> = {
  conditions: [{ field: "os", appliesTo: ["Windows 10"] }],
};

describe("checkArticleConditions (aceite do F1)", () => {
  test("Windows 10: o artigo se aplica", () => {
    expect(checkArticleConditions(vpn809, { os: "Windows 10" })).toEqual({ status: "applies" });
  });

  test("Windows 11: não se aplica, e diz o que contrariou", () => {
    expect(checkArticleConditions(vpn809, { os: "Windows 11" })).toEqual({
      status: "does_not_apply",
      field: "os",
      knownValue: "Windows 11",
      appliesTo: ["Windows 10"],
    });
  });

  test.each([null, undefined, "Não sei", "  "])("SO %j: falta confirmar o campo os", (os) => {
    expect(checkArticleConditions(vpn809, { os })).toEqual({
      status: "needs_confirmation",
      field: "os",
      appliesTo: ["Windows 10"],
    });
  });

  test("artigo sem condição sempre se aplica", () => {
    expect(checkArticleConditions({}, {})).toEqual({ status: "applies" });
  });

  test("campo que o ENTENDER não extrai fica para confirmar", () => {
    const article = { conditions: [{ field: "browser", appliesTo: ["Chrome"] }] };
    expect(checkArticleConditions(article, { os: "Windows 10" })).toMatchObject({
      status: "needs_confirmation",
      field: "browser",
    });
  });

  test("com várias condições, uma contrária vence uma desconhecida", () => {
    const article = {
      conditions: [
        { field: "device", appliesTo: ["notebook"] },
        { field: "os", appliesTo: ["Windows 10"] },
      ],
    };
    expect(checkArticleConditions(article, { os: "Windows 11" })).toMatchObject({
      status: "does_not_apply",
      field: "os",
    });
    expect(checkArticleConditions(article, { os: "Windows 10" })).toMatchObject({
      status: "needs_confirmation",
      field: "device",
    });
  });
});

describe("checkArticleConditions: dispositivo (QA R1, e-mail no celular)", () => {
  const mobileMail: Pick<Article, "conditions"> = {
    conditions: [{ field: "device", appliesTo: ["celular", "smartphone", "iPhone", "Android"] }],
  };

  test.each(["celular", "meu celular Android", "No celular", "iPhone 13"])(
    "%j: o artigo se aplica",
    (device) => {
      expect(checkArticleConditions(mobileMail, { device })).toEqual({ status: "applies" });
    },
  );

  test.each(["computador", "No computador", "notebook"])("%j: não se aplica", (device) => {
    expect(checkArticleConditions(mobileMail, { device })).toMatchObject({
      status: "does_not_apply",
      field: "device",
    });
  });

  test("sem dispositivo, falta confirmar", () => {
    expect(checkArticleConditions(mobileMail, { device: null })).toMatchObject({
      status: "needs_confirmation",
      field: "device",
    });
  });
});

describe("devicesConflict", () => {
  test("o Outlook do celular não é o do computador; sem aparelho, não há conflito", () => {
    const ticket = "Outlook não sincroniza no celular";
    expect(devicesConflict(ticket, ["O Outlook do meu computador não abre"])).toBe(true);
    expect(devicesConflict(ticket, ["O Outlook não sincroniza os e-mails desde ontem"])).toBe(
      false,
    );
    expect(devicesConflict(ticket, ["No meu iPhone o Outlook parou"])).toBe(false);
    expect(devicesConflict("Impressora do 2º andar não imprime", ["notebook novo"])).toBe(false);
  });
});

describe("normalizeConditionValue", () => {
  test.each(["Windows 11", "windows11", "Win 11", "win11", "WINDOWS-11"])(
    "%s → windows11",
    (value) => {
      expect(normalizeConditionValue(value)).toBe("windows11");
    },
  );

  test("variações de Windows 10 se aplicam ao artigo", () => {
    expect(checkArticleConditions(vpn809, { os: "win 10" })).toEqual({ status: "applies" });
    expect(checkArticleConditions(vpn809, { os: "windows10" })).toEqual({ status: "applies" });
  });
});
