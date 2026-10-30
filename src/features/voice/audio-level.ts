// Nível do microfone enquanto grava, sem React nem navegador: alimenta o medidor da tela e
// a checagem de "gravou só silêncio" antes de mandar o áudio para o Whisper.
//
// Por que existe: com o microfone mudo ou o dispositivo errado, o Whisper não devolve erro,
// devolve uma "alucinação" curta ("E aí", "Obrigado."), e a pessoa vê quase nada no campo
// sem entender por quê. Medindo o nível, mostramos que o microfone está captando e não
// gastamos uma transcrição com silêncio.

/**
 * Abaixo disto (RMS da janela mais alta da gravação, em dBFS) tratamos como silêncio.
 * Microfone mudo dá silêncio digital (-∞); ruído de sala fica perto de -60 a -70 dBFS; fala
 * normal sem ganho automático fica entre -45 e -20 dBFS. O Whisper ainda entende fala bem
 * baixa (testado com pico em -60 dBFS), então o corte é conservador.
 */
export const SILENCE_DBFS = -60;

/** Faixa do medidor: -60 dBFS acende nada, -15 dBFS ou mais acende tudo. */
const METER_FLOOR_DBFS = SILENCE_DBFS;
const METER_CEILING_DBFS = -15;

/** Gravando há este tempo sem ouvir voz, avisamos para conferir o microfone. */
export const SILENCE_WARNING_SECONDS = 3;

/** RMS das amostras (de -1 a 1) em dBFS; silêncio digital dá -Infinity. */
export function rmsDbfs(samples: ArrayLike<number>): number {
  if (samples.length === 0) return -Infinity;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / samples.length);
  return rms === 0 ? -Infinity : 20 * Math.log10(rms);
}

/** dBFS → 0..1 para o medidor. */
export function meterLevel(dbfs: number): number {
  const span = METER_CEILING_DBFS - METER_FLOOR_DBFS;
  return Math.min(1, Math.max(0, (dbfs - METER_FLOOR_DBFS) / span));
}

export function isVoiceLevel(dbfs: number): boolean {
  return dbfs >= SILENCE_DBFS;
}

/**
 * A gravação inteira ficou abaixo do limiar de voz. `null` quando o navegador não deixou
 * medir (sem Web Audio): aí não dá para saber, e o áudio segue para a transcrição.
 */
export function isSilentRecording(loudestDbfs: number | null): boolean {
  return loudestDbfs !== null && !isVoiceLevel(loudestDbfs);
}
