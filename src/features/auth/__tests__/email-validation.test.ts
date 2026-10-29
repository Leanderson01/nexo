import { describe, expect, test } from "vitest";

import { describeSignInError, validateCorporateEmail } from "../email-validation";

describe("validateCorporateEmail", () => {
  test("aceita e-mail corporativo, com espaços e maiúsculas", () => {
    expect(validateCorporateEmail(" Mariana.Costa@nexo.com.br ")).toBeNull();
  });

  test("recusa vazio, formato inválido e outro domínio", () => {
    expect(validateCorporateEmail("")).toBe("Digite seu e-mail corporativo.");
    expect(validateCorporateEmail("mariana")).toMatch(/e-mail válido/);
    expect(validateCorporateEmail("mariana@gmail.com")).toBe(
      "Use seu e-mail corporativo @nexo.com.br.",
    );
  });
});

describe("describeSignInError", () => {
  test("e-mail desconhecido aparece no campo", () => {
    const error = new Error(
      '[Request ID: 1] Server Error Uncaught ConvexError: "Não encontramos esse e-mail."',
    );
    expect(describeSignInError(error)).toEqual({
      field: "email",
      message: "Não encontramos esse e-mail.",
    });
  });

  test("qualquer outra falha vira aviso geral", () => {
    expect(describeSignInError(new Error("fetch failed")).field).toBe("form");
  });
});
