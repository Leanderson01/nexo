// Aviso sonoro da fila (T17): duas notas curtas geradas com Web Audio, sem arquivo de som.
// O navegador só libera o áudio depois de um gesto do usuário, por isso `unlockChime` é
// chamado no clique que liga o som.

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
  context ??= new window.AudioContext();
  return context;
}

/** Chame num clique: cria ou retoma o contexto de áudio. */
export function unlockChime(): void {
  void audioContext()
    ?.resume()
    .catch(() => {});
}

/** "Plim-plom": 880 Hz e 1.320 Hz, 0,15 s cada, com volume baixo e sem estalo no fim. */
export function playChime(): void {
  const audio = audioContext();
  if (!audio || audio.state !== "running") return;

  const notes = [880, 1320];
  notes.forEach((frequency, index) => {
    const start = audio.currentTime + index * 0.16;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.16);
  });
}
