// Validação do e-mail no login (§7.1): formato e domínio corporativo.

export const CORPORATE_EMAIL_DOMAIN = "nexo.com.br";

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Mensagem de erro para mostrar no campo, ou null se o e-mail é aceitável. */
export function validateCorporateEmail(raw: string): string | null {
  const email = normalizeEmail(raw);
  if (!email) return "Digite seu e-mail corporativo.";
  if (!EMAIL_FORMAT.test(email)) return "Digite um e-mail válido, como nome.sobrenome@nexo.com.br.";
  if (!email.endsWith(`@${CORPORATE_EMAIL_DOMAIN}`)) {
    return `Use seu e-mail corporativo @${CORPORATE_EMAIL_DOMAIN}.`;
  }
  return null;
}

export const UNKNOWN_EMAIL_MESSAGE = "Não encontramos esse e-mail.";
const GENERIC_SIGN_IN_ERROR = "Não foi possível entrar agora. Tente de novo em instantes.";

/** Traduz o erro do signIn: e-mail fora do seed vai para o campo; o resto vira aviso geral. */
export function describeSignInError(error: unknown): { field: "email" | "form"; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes(UNKNOWN_EMAIL_MESSAGE)) {
    return { field: "email", message: UNKNOWN_EMAIL_MESSAGE };
  }
  return { field: "form", message: GENERIC_SIGN_IN_ERROR };
}
