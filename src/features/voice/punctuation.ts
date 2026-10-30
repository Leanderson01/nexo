// Pós-processamento leve do texto que vem do Whisper (§11.1): só arruma espaços, maiúscula e
// ponto final. Não reescreve palavras nem chama o LLM; quem passa a limpo de verdade é o agent.

const SENTENCE_END = /[.!?…]$/;
const TRAILING_SOFT_PUNCTUATION = /[,;:\s]+$/;

export function tidyTranscript(raw: string): string {
  const spaced = raw
    .replace(/\s+/g, " ") // quebras de linha e espaços repetidos viram um espaço
    .replace(/\s+([,.;:!?…])/g, "$1") // sem espaço antes da pontuação
    .trim();
  if (!hasWords(spaced)) return "";

  const capitalized = capitalizeSentences(spaced);
  return endWithPeriod(capitalized);
}

/** Texto sem nenhuma letra ou número (só pontuação) não é fala. */
function hasWords(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

/** Maiúscula no começo do texto e depois de ponto final, exclamação ou interrogação. */
function capitalizeSentences(text: string): string {
  return text.replace(
    /(^|[.!?…]\s+)(\p{Ll})/gu,
    (_match, before: string, letter: string) => before + letter.toUpperCase(),
  );
}

function endWithPeriod(text: string): string {
  if (SENTENCE_END.test(text)) return text;
  return text.replace(TRAILING_SOFT_PUNCTUATION, "") + ".";
}
