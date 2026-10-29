import { describe, expect, it } from "vitest";

import { maskSensitiveData } from "../sensitive-data";

describe("maskSensitiveData: senhas", () => {
  it.each([
    ["minha senha é Abc@1234", "minha senha é [SENHA REMOVIDA]"],
    ["Minha senha É primavera", "Minha senha É [SENHA REMOVIDA]"],
    ["senha: hunter2", "senha: [SENHA REMOVIDA]"],
    ["senha=hunter2", "senha=[SENHA REMOVIDA]"],
    ["a senha é Primavera2026. Pode testar?", "a senha é [SENHA REMOVIDA]. Pode testar?"],
    [
      "a senha do SAP é Sap#2026, mas não entra",
      "a senha do SAP é [SENHA REMOVIDA], mas não entra",
    ],
    ["password Xyz!987", "password [SENHA REMOVIDA]"],
    ["my password is letmein", "my password is [SENHA REMOVIDA]"],
    ["tentei com a senha Abc@123 e não foi", "tentei com a senha [SENHA REMOVIDA] e não foi"],
  ])("%s", (input, expected) => {
    expect(maskSensitiveData(input)).toEqual({ text: expected, masked: true });
  });
});

describe("maskSensitiveData: tokens e chaves", () => {
  const jwt =
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

  it.each([
    [`o token é ${jwt}`, "o token é [TOKEN REMOVIDO]"],
    ["Authorization: Bearer " + jwt, "Authorization: Bearer [TOKEN REMOVIDO]"],
    ["chave sk-proj-a1B2c3D4e5F6g7H8i9J0 vazou", "chave [TOKEN REMOVIDO] vazou"],
    ["ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8", "[TOKEN REMOVIDO]"],
    ["GROQ_API_KEY=gsk_a1B2c3D4e5F6g7H8i9J0k1L2", "GROQ_API_KEY=[TOKEN REMOVIDO]"],
    ["access key AKIAIOSFODNN7EXAMPLE", "access key [TOKEN REMOVIDO]"],
    ["token: 7f3a9c2e1b", "token: [TOKEN REMOVIDO]"],
    ["segue: Zx81kQp0LmN3vR7tYw2Hs6Jd9Fg4Ac5B", "segue: [TOKEN REMOVIDO]"],
    ["hash d41d8cd98f00b204e9800998ecf8427e aqui", "hash [TOKEN REMOVIDO] aqui"],
  ])("%s", (input, expected) => {
    expect(maskSensitiveData(input)).toEqual({ text: expected, masked: true });
  });

  it("mascara senha e token na mesma mensagem", () => {
    const result = maskSensitiveData("senha: abc123 e token sk-a1B2c3D4e5F6g7H8i9J0k1");
    expect(result).toEqual({
      text: "senha: [SENHA REMOVIDA] e token [TOKEN REMOVIDO]",
      masked: true,
    });
  });
});

describe("maskSensitiveData: falsos positivos", () => {
  it.each([
    "esqueci minha senha",
    "preciso redefinir a senha de rede",
    "a senha do SAP está bloqueada",
    "minha senha do SAP bloqueou de novo",
    "minha senha é muito fraca?",
    "a senha de rede é obrigatória",
    "errei a senha 3 vezes",
    "quero fazer o password reset",
    "como anda o INC-20311?",
    "a VPN dá erro 809 no Windows 11",
    "o REQ-10442 foi aprovado",
    "veja https://intranet.nexo.com.br/docs/2024/relatorio-financeiro-trimestral-v2",
    "o arquivo planejamento-orcamentario-segundo-semestre-2026.xlsx não abre",
    "",
  ])("%s", (input) => {
    expect(maskSensitiveData(input)).toEqual({ text: input, masked: false });
  });
});
