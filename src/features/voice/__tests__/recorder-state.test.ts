import { describe, expect, test } from "vitest";

import { pickRecordingMimeType, toAcceptedAudioType } from "../audio-format";
import { SILENCE_DBFS, isSilentRecording, meterLevel, rmsDbfs } from "../audio-level";
import {
  IDLE,
  appendTranscript,
  canStart,
  formatElapsed,
  isBusy,
  microphoneProblemOf,
  recorderReducer,
  shouldAutoStop,
  shouldWarnSilence,
  type RecorderEvent,
  type RecorderState,
} from "../recorder-state";

function run(events: RecorderEvent[], from: RecorderState = IDLE): RecorderState {
  return events.reduce(recorderReducer, from);
}

const START = 1_000_000;

function recordingAt(elapsedSeconds: number, heardVoice = true): RecorderState {
  return { status: "recording", startedAt: START, elapsedSeconds, level: 0, heardVoice };
}

describe("estado do gravador", () => {
  test("caminho feliz: pede permissão, grava, transcreve e volta a parado", () => {
    expect(run([{ type: "start_requested" }])).toEqual({ status: "requesting_permission" });

    const recording = run([
      { type: "start_requested" },
      { type: "recording_started", now: START },
      { type: "tick", now: START + 7_400, levelDbfs: -30 },
    ]);
    expect(recording).toEqual({
      status: "recording",
      startedAt: START,
      elapsedSeconds: 7.4,
      level: 30 / 45,
      heardVoice: true,
    });

    const transcribing = recorderReducer(recording, { type: "stopped" });
    expect(transcribing).toEqual({ status: "transcribing" });
    expect(recorderReducer(transcribing, { type: "transcribed" })).toEqual(IDLE);
  });

  test("cancelar descarta a gravação e volta a parado", () => {
    const recording = run([{ type: "start_requested" }, { type: "recording_started", now: START }]);
    expect(recorderReducer(recording, { type: "cancelled" })).toEqual(IDLE);
  });

  test("erro guarda a mensagem; fechar ou gravar de novo sai dele", () => {
    const error = run([{ type: "start_requested" }, { type: "failed", message: "Negado." }]);
    expect(error).toEqual({ status: "error", message: "Negado." });
    expect(recorderReducer(error, { type: "dismissed" })).toEqual(IDLE);
    expect(recorderReducer(error, { type: "start_requested" })).toEqual({
      status: "requesting_permission",
    });
  });

  test("ignora eventos fora de hora", () => {
    // Um getUserMedia que volta depois de cancelado não liga a gravação.
    expect(recorderReducer(IDLE, { type: "recording_started", now: START })).toEqual(IDLE);
    expect(recorderReducer(IDLE, { type: "stopped" })).toEqual(IDLE);
    expect(recorderReducer(IDLE, { type: "tick", now: START, levelDbfs: -20 })).toEqual(IDLE);
    // Não começa outra gravação enquanto transcreve.
    const transcribing: RecorderState = { status: "transcribing" };
    expect(recorderReducer(transcribing, { type: "start_requested" })).toBe(transcribing);
  });

  test("só pode começar parado ou depois de erro; ocupado enquanto grava ou transcreve", () => {
    const recording = recordingAt(3);
    expect(canStart(IDLE)).toBe(true);
    expect(canStart({ status: "error", message: "x" })).toBe(true);
    expect(canStart(recording)).toBe(false);

    expect(isBusy(IDLE)).toBe(false);
    expect(isBusy({ status: "error", message: "x" })).toBe(false);
    expect(isBusy({ status: "requesting_permission" })).toBe(true);
    expect(isBusy(recording)).toBe(true);
    expect(isBusy({ status: "transcribing" })).toBe(true);
  });

  test("corta sozinho ao chegar em 60 s", () => {
    const at = (elapsedSeconds: number) => recordingAt(elapsedSeconds);
    expect(shouldAutoStop(at(59.9), 60)).toBe(false);
    expect(shouldAutoStop(at(60), 60)).toBe(true);
    expect(shouldAutoStop({ status: "transcribing" }, 60)).toBe(false);
  });

  test("formata o tempo como m:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(7.9)).toBe("0:07");
    expect(formatElapsed(60)).toBe("1:00");
  });

  test("o texto transcrito entra depois do que já estava escrito", () => {
    expect(appendTranscript("", "Minha VPN caiu.")).toBe("Minha VPN caiu.");
    expect(appendTranscript("Oi.  ", "Minha VPN caiu.")).toBe("Oi. Minha VPN caiu.");
  });

  test("traduz o erro do microfone pelo nome da DOMException", () => {
    const named = (name: string) => Object.assign(new Error(name), { name });
    expect(microphoneProblemOf(named("NotAllowedError"))).toBe("permission_denied");
    expect(microphoneProblemOf(named("NotFoundError"))).toBe("no_microphone");
    expect(microphoneProblemOf(named("NotReadableError"))).toBe("unsupported");
    expect(microphoneProblemOf("qualquer coisa")).toBe("unsupported");
  });
});

describe("formato do áudio", () => {
  test("o gravador usa o primeiro formato que o navegador suporta", () => {
    expect(pickRecordingMimeType(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickRecordingMimeType((type) => type === "audio/mp4")).toBe("audio/mp4"); // Safari
    expect(pickRecordingMimeType(() => false)).toBeUndefined();
  });

  test("a rota aceita o tipo sem os parâmetros e recusa o que não é áudio", () => {
    expect(toAcceptedAudioType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(toAcceptedAudioType("Audio/OGG; codecs=opus")).toBe("audio/ogg");
    expect(toAcceptedAudioType("application/json")).toBeNull();
    expect(toAcceptedAudioType(null)).toBeNull();
  });
});

describe("nível do microfone enquanto grava", () => {
  const started = run([{ type: "start_requested" }, { type: "recording_started", now: START }]);
  const tickAt = (seconds: number, levelDbfs: number | null): RecorderEvent => ({
    type: "tick",
    now: START + seconds * 1000,
    levelDbfs,
  });

  test("o medidor acompanha o nível e lembra que já ouviu voz", () => {
    const loud = recorderReducer(started, tickAt(1, -20));
    expect(loud).toMatchObject({ level: 40 / 45, heardVoice: true });
    // Pausa: o medidor desce, mas a gravação continua "com voz".
    expect(recorderReducer(loud, tickAt(2, -80))).toMatchObject({ level: 0, heardVoice: true });
  });

  test("sem medição (sem Web Audio) só anda o relógio", () => {
    expect(recorderReducer(started, tickAt(4, null))).toMatchObject({
      elapsedSeconds: 4,
      level: 0,
      heardVoice: false,
    });
  });

  test("avisa depois de 3 s só de silêncio, e para de avisar quando a voz chega", () => {
    const quiet = [tickAt(1, -Infinity), tickAt(2.9, -75)].reduce(recorderReducer, started);
    expect(shouldWarnSilence(quiet)).toBe(false);
    const stillQuiet = recorderReducer(quiet, tickAt(3, -70));
    expect(shouldWarnSilence(stillQuiet)).toBe(true);
    expect(shouldWarnSilence(recorderReducer(stillQuiet, tickAt(3.1, -40)))).toBe(false);
    expect(shouldWarnSilence({ status: "transcribing" })).toBe(false);
  });
});

describe("nível em dBFS", () => {
  test("RMS de um seno cheio dá -3 dBFS; silêncio digital dá -Infinity", () => {
    const sine = Array.from({ length: 4800 }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / 48000));
    expect(rmsDbfs(sine)).toBeCloseTo(-3.01, 1);
    expect(rmsDbfs(new Float32Array(2048))).toBe(-Infinity);
    expect(rmsDbfs([])).toBe(-Infinity);
  });

  test("o medidor vai de 0 (-60 dBFS) a 1 (-15 dBFS)", () => {
    expect(meterLevel(-Infinity)).toBe(0);
    expect(meterLevel(-60)).toBe(0);
    expect(meterLevel(-37.5)).toBeCloseTo(0.5);
    expect(meterLevel(0)).toBe(1);
  });

  test("gravação só de silêncio não vai para o Whisper; sem medição, vai", () => {
    expect(isSilentRecording(-Infinity)).toBe(true);
    expect(isSilentRecording(-65)).toBe(true);
    expect(isSilentRecording(SILENCE_DBFS)).toBe(false);
    expect(isSilentRecording(-35)).toBe(false);
    expect(isSilentRecording(null)).toBe(false);
  });
});
