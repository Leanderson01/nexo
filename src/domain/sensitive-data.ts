export interface MaskResult {
  text: string;
  /** Verdadeiro quando algo foi removido; o agent dá o aviso educativo (§11.3). */
  masked: boolean;
}

export const PASSWORD_PLACEHOLDER = "[SENHA REMOVIDA]";
export const TOKEN_PLACEHOLDER = "[TOKEN REMOVIDO]";

/**
 * Mascara senhas, tokens e chaves antes de salvar e de enviar ao modelo (§11.3).
 * Na dúvida, não mascara: "esqueci minha senha" ou "a senha do SAP está bloqueada"
 * falam de senha sem conter uma.
 */
export function maskSensitiveData(text: string): MaskResult {
  const masked = maskTokens(maskPasswords(text));
  return { text: masked, masked: masked !== text };
}

// ---------------------------------------------------------------------------
// Senhas

/**
 * Palavra-chave, um complemento opcional ("do SAP") e um conector explícito:
 * "minha senha é X", "senha: X", "a senha do SAP é X", "password is X".
 */
const PASSWORD_WITH_CONNECTOR =
  /\b(senha|password|passwd|pwd)(\s+(?:d[oae]|of|for)\s+[\wÀ-ÿ-]+)?(\s*[:=]\s*|\s+(?:é|eh|era|is)\s+)(\S+)/gi;

/** Sem conector ("password Xyz!987", "a senha Abc@123"): só se o valor parece senha. */
const PASSWORD_WITHOUT_CONNECTOR = /\b(senha|password|passwd|pwd)(\s+)(\S+)/gi;

/**
 * Palavras que vêm depois de "senha é" sem serem a senha ("a senha é muito fraca").
 * Lista curta de propósito; é o primeiro lugar a mexer se aparecer um falso positivo.
 */
// prettier-ignore
const NOT_A_PASSWORD = new Set([
  "a", "o", "as", "os", "um", "uma", "de", "do", "da", "que", "não", "nao", "sim",
  "muito", "muita", "mesma", "mesmo", "igual", "nova", "novo", "antiga", "antigo",
  "fraca", "forte", "diferente", "obrigatória", "obrigatoria", "inválida", "invalida",
  "errada", "incorreta", "expirada", "bloqueada", "padrão", "padrao", "temporária",
  "temporaria", "provisória", "provisoria", "essa", "esta", "isso", "isto", "minha", "sua",
  "the", "my", "not", "too", "very", "same", "new", "old", "wrong", "incorrect",
  "expired", "invalid", "required",
]);

// A busca sem conector roda primeiro: se rodasse depois, leria o "SENHA" do próprio
// "[SENHA REMOVIDA]" como palavra-chave.
function maskPasswords(text: string): string {
  return text
    .replace(PASSWORD_WITHOUT_CONNECTOR, (match, keyword, space, value) => {
      const { core, trailing } = splitTrailingPunctuation(value);
      if (!looksLikeLoosePassword(core)) return match;
      return `${keyword}${space}${PASSWORD_PLACEHOLDER}${trailing}`;
    })
    .replace(PASSWORD_WITH_CONNECTOR, (match, keyword, qualifier = "", connector, value) => {
      const { core, trailing } = splitTrailingPunctuation(value);
      if (!looksLikeStatedPassword(core)) return match;
      return `${keyword}${qualifier}${connector}${PASSWORD_PLACEHOLDER}${trailing}`;
    });
}

/** Depois de "senha é": qualquer palavra que não seja da lista acima. */
function looksLikeStatedPassword(value: string): boolean {
  if (value === "" || value.startsWith("[")) return false;
  return !NOT_A_PASSWORD.has(value.toLowerCase());
}

/** Sem conector o risco de falso positivo é maior: exige letra e dígito ou símbolo. */
function looksLikeLoosePassword(value: string): boolean {
  if (value.length < 4 || value.startsWith("[")) return false;
  const hasLetter = /[A-Za-z]/.test(value);
  const hasDigitOrSymbol = /[^A-Za-zÀ-ÿ]/.test(value);
  return hasLetter && hasDigitOrSymbol;
}

/** Separa a pontuação do fim da frase para não engoli-la junto com a senha. */
function splitTrailingPunctuation(value: string): { core: string; trailing: string } {
  const [, core = "", trailing = ""] = /^(.*?)([.,;!?)"']*)$/.exec(value) ?? [];
  return { core, trailing };
}

// ---------------------------------------------------------------------------
// Tokens e chaves

/** Formatos conhecidos: JWT, chaves OpenAI/Groq/GitHub/AWS/Slack. */
const KNOWN_TOKEN_PATTERNS: readonly RegExp[] = [
  /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]+/g,
  /\b(?:sk|pk|rk)-[\w-]{16,}/g,
  /\bgsk_[A-Za-z0-9]{20,}/g,
  /\b(?:gh[pousr]_|github_pat_)\w{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
];

/** "token: X", "api key = X": valor com 8+ caracteres e algum dígito. */
const TOKEN_WITH_KEYWORD = /\b(token|api[ _-]?key|secret)(\s*[:=]\s*)([\w.-]{8,})/gi;

/** Sequência longa sem espaço; só vira token se parecer aleatória (ver abaixo). */
const LONG_SEQUENCE = /[\w-]{32,}/g;

function maskTokens(text: string): string {
  let result = text;
  for (const pattern of KNOWN_TOKEN_PATTERNS) {
    result = result.replace(pattern, TOKEN_PLACEHOLDER);
  }
  result = result.replace(TOKEN_WITH_KEYWORD, (match, keyword, connector, value) =>
    /\d/.test(value) ? `${keyword}${connector}${TOKEN_PLACEHOLDER}` : match,
  );
  return result.replace(LONG_SEQUENCE, (match) => (looksRandom(match) ? TOKEN_PLACEHOLDER : match));
}

/**
 * Aleatória: mistura maiúsculas, minúsculas e dígitos, ou é hexadecimal.
 * Nomes de arquivo e trechos de URL ("relatorio-trimestral-2024-v2") não passam.
 */
function looksRandom(sequence: string): boolean {
  const mixesCaseAndDigits =
    /[a-z]/.test(sequence) && /[A-Z]/.test(sequence) && /\d/.test(sequence);
  const isHex = /^[0-9a-f]+$/i.test(sequence) && /\d/.test(sequence) && /[a-f]/i.test(sequence);
  return mixesCaseAndDigits || isHex;
}
