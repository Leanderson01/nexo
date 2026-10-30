import { rmsDbfs } from "./audio-level";

// Lê o nível do microfone com Web Audio (AnalyserNode), em paralelo ao MediaRecorder.
// Não altera o áudio gravado: o analisador só escuta o mesmo stream.

export interface LevelMeter {
  /**
   * Nível atual (RMS da última janela de ~40 ms), em dBFS. null enquanto o contexto de áudio
   * não está rodando: o analisador devolveria zeros, que pareceriam silêncio.
   */
  readDbfs: () => number | null;
  close: () => void;
}

/** null quando o navegador não tem Web Audio; a gravação segue sem medidor. */
export function createLevelMeter(stream: MediaStream): LevelMeter | null {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
  try {
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    // Criado logo depois do clique, o contexto costuma nascer ativo; se não, tenta retomar.
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const samples = new Float32Array(analyser.fftSize);
    return {
      readDbfs: () => {
        if (context.state !== "running") return null;
        analyser.getFloatTimeDomainData(samples);
        return rmsDbfs(samples);
      },
      close: () => {
        source.disconnect();
        void context.close().catch(() => undefined);
      },
    };
  } catch {
    return null;
  }
}
