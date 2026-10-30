import type { MessagePart } from "@/domain/message-parts";

// Regras puras do "ouvir resposta" (§11.1): qual voz usar e o que ler.

/** O mínimo que usamos de `SpeechSynthesisVoice`, para testar sem navegador. */
export interface VoiceOption {
  lang: string;
  default: boolean;
}

/** "pt-BR", "pt_BR" e "pt-br" são a mesma coisa para cada navegador. */
function isBrazilianPortuguese(lang: string): boolean {
  return lang.replace("_", "-").toLowerCase() === "pt-br";
}

/** Uma voz pt-BR (a padrão do sistema, se for pt-BR); sem nenhuma, null e o botão some. */
export function pickBrazilianVoice<T extends VoiceOption>(voices: readonly T[]): T | null {
  const brazilian = voices.filter((voice) => isBrazilianPortuguese(voice.lang));
  return brazilian.find((voice) => voice.default) ?? brazilian[0] ?? null;
}

/** Só o texto da resposta: cards, seletor e opções rápidas não são lidos. */
export function speakableText(parts: readonly MessagePart[]): string {
  return parts
    .map((part) => (part.type === "text" ? part.text.trim() : ""))
    .filter((text) => text !== "")
    .join(" ");
}
