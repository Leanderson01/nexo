export interface MaskResult {
  text: string;
  /** Verdadeiro quando algo foi removido; o agent dá o aviso educativo (§11.3). */
  masked: boolean;
}

/**
 * Mascara senhas, tokens e chaves antes de salvar e de enviar ao modelo (§11.3).
 * Assinatura travada no T0; a detecção de verdade é implementada na T1.
 */
export function maskSensitiveData(text: string): MaskResult {
  return { text, masked: false };
}
