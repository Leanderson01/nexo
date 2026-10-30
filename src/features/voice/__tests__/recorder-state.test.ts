import { describe, expect, test } from "vitest";

import { pickRecordingMimeType, toAcceptedAudioType } from "../audio-format";
import {
  IDLE,
  appendTranscript,
  canStart,
  formatElapsed,
  isBusy,
  microphoneProblemOf,
  recorderReducer,
  shouldAutoStop,
  type RecorderEvent,
  type RecorderState,
} from "../recorder-state";

function run(events: RecorderEvent[], from: RecorderState = IDLE): RecorderState {
  return events.reduce(recorderReducer, from);
}

const START = 1_000_000;

describe("estado do gravador", () => {
  test("caminho feliz: pede permissão, grava, transcreve e volta a parado", () => {
    expect(run([{ type: "start_requested" }])).toEqual({ status: "requesting_permission" });

    const recording = run([
      { type: "start_requested" },
      { type: "recording_started", now: START },
      { type: "tick", now: START + 7_400 },
    ]);
    expect(recording).toEqual({ status: "recording", startedAt: START, elapsedSeconds: 7.4 });

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
    expect(recorderReducer(IDLE, { type: "tick", now: START })).toEqual(IDLE);
    // Não começa outra gravação enquanto transcreve.
    const transcribing: RecorderState = { status: "transcribing" };
    expect(recorderReducer(transcribing, { type: "start_requested" })).toBe(transcribing);
  });

  test("só pode começar parado ou depois de erro; ocupado enquanto grava ou transcreve", () => {
    const recording: RecorderState = { status: "recording", startedAt: START, elapsedSeconds: 3 };
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
    const at = (elapsedSeconds: number): RecorderState => ({
      status: "recording",
      startedAt: START,
      elapsedSeconds,
    });
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
