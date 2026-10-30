import { describe, expect, test } from "vitest";

import { secretsMatch } from "../lib/secrets";

describe("secretsMatch", () => {
  test("aceita o segredo igual", () => {
    expect(secretsMatch("s3gredo-longo", "s3gredo-longo")).toBe(true);
  });

  test("recusa diferença no começo, no meio e no fim", () => {
    expect(secretsMatch("X3gredo-longo", "s3gredo-longo")).toBe(false);
    expect(secretsMatch("s3gredX-longo", "s3gredo-longo")).toBe(false);
    expect(secretsMatch("s3gredo-longX", "s3gredo-longo")).toBe(false);
  });

  test("recusa prefixo, segredo mais longo e vazio", () => {
    expect(secretsMatch("s3gredo", "s3gredo-longo")).toBe(false);
    expect(secretsMatch("s3gredo-longo-e-mais", "s3gredo-longo")).toBe(false);
    expect(secretsMatch("", "s3gredo-longo")).toBe(false);
  });

  test("compara bytes, não só caracteres (acentos)", () => {
    expect(secretsMatch("chavé", "chavé")).toBe(true);
    expect(secretsMatch("chave", "chavé")).toBe(false);
  });
});
