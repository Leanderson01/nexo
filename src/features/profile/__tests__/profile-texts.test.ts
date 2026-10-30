import { describe, expect, test } from "vitest";

import { passwordResetNotice } from "../profile-texts";

describe("passwordResetNotice", () => {
  test("cita o e-mail da pessoa, como no protótipo", () => {
    expect(passwordResetNotice("mariana.costa@nexo.com.br")).toBe(
      "Enviaremos um link de redefinição para mariana.costa@nexo.com.br.",
    );
  });
});
