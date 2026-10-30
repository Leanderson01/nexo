"use client";

import { useEffect, useReducer, useRef } from "react";

import { MAX_RECORDING_SECONDS, pickRecordingMimeType } from "./audio-format";
import {
  IDLE,
  MICROPHONE_MESSAGES,
  canStart,
  microphoneProblemOf,
  recorderReducer,
  shouldAutoStop,
  type RecorderState,
} from "./recorder-state";
import { transcribeAudio } from "./transcribe-api";

// Gravador do campo de mensagem (§11.1): MediaRecorder → /api/transcribe → texto no campo.
// O texto só chega por `onTranscribed`; nada é enviado sozinho.

export interface VoiceRecorder {
  state: RecorderState;
  start: () => void;
  /** Para e transcreve o que foi gravado. */
  stop: () => void;
  /** Para e descarta o áudio. */
  cancel: () => void;
  dismissError: () => void;
}

interface RecordingSession {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  cancelled: boolean;
}

/** Opus a 32 kbps: voz clara e ~240 KB por minuto. */
const AUDIO_BITS_PER_SECOND = 32_000;
const TICK_MS = 250;

export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export function useVoiceRecorder(options: {
  /** Campo bloqueado: não grava, e uma gravação em andamento é descartada. */
  disabled: boolean;
  onTranscribed: (text: string) => void;
}): VoiceRecorder {
  const [state, dispatch] = useReducer(recorderReducer, IDLE);
  const session = useRef<RecordingSession | null>(null);
  // Cada início ou cancelamento muda a tentativa; um getUserMedia que volta depois de um
  // cancelamento percebe que ficou velho e solta o microfone.
  const attempt = useRef(0);
  const onTranscribed = useRef(options.onTranscribed);

  useEffect(() => {
    onTranscribed.current = options.onTranscribed;
  });

  async function start() {
    if (options.disabled || !canStart(state)) return;
    if (!isRecordingSupported()) {
      dispatch({ type: "failed", message: MICROPHONE_MESSAGES.unsupported });
      return;
    }
    dispatch({ type: "start_requested" });
    const thisAttempt = ++attempt.current;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      if (thisAttempt === attempt.current) {
        dispatch({ type: "failed", message: MICROPHONE_MESSAGES[microphoneProblemOf(error)] });
      }
      return;
    }
    if (thisAttempt !== attempt.current) {
      stopTracks(stream);
      return;
    }
    beginRecording(stream);
  }

  function beginRecording(stream: MediaStream) {
    const mimeType = pickRecordingMimeType((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });
    const current: RecordingSession = { recorder, stream, chunks: [], cancelled: false };
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) current.chunks.push(event.data);
    };
    recorder.onstop = () => {
      stopTracks(stream);
      if (session.current === current) session.current = null;
      if (current.cancelled) return;
      const type = recorder.mimeType || mimeType || "audio/webm";
      void transcribe(new Blob(current.chunks, { type }));
    };
    recorder.onstart = () => dispatch({ type: "recording_started", now: Date.now() });
    session.current = current;
    recorder.start();
  }

  async function transcribe(audio: Blob) {
    if (audio.size === 0) {
      dispatch({ type: "failed", message: MICROPHONE_MESSAGES.empty });
      return;
    }
    const result = await transcribeAudio(audio);
    if (!result.ok) {
      dispatch({ type: "failed", message: result.error });
      return;
    }
    onTranscribed.current(result.value);
    dispatch({ type: "transcribed" });
  }

  function stop() {
    const current = session.current;
    if (!current || current.recorder.state === "inactive") return;
    current.recorder.stop(); // o `onstop` manda o áudio para a transcrição
    dispatch({ type: "stopped" });
  }

  function cancel() {
    attempt.current++;
    const current = session.current;
    if (current) {
      current.cancelled = true;
      if (current.recorder.state !== "inactive") current.recorder.stop();
      else stopTracks(current.stream);
    }
    dispatch({ type: "cancelled" });
  }

  // Relógio da gravação.
  const isRecording = state.status === "recording";
  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => dispatch({ type: "tick", now: Date.now() }), TICK_MS);
    return () => clearInterval(timer);
  }, [isRecording]);

  // Corte automático em 60 s: para e transcreve o que tem.
  const reachedLimit = shouldAutoStop(state, MAX_RECORDING_SECONDS);
  useEffect(() => {
    if (reachedLimit) stop();
  });

  // Campo bloqueado no meio da gravação (ex.: o analista encerrou): descarta.
  const isCapturing = isRecording || state.status === "requesting_permission";
  useEffect(() => {
    if (options.disabled && isCapturing) cancel();
  });

  // Saiu da tela: solta o microfone.
  useEffect(() => () => releaseOnUnmount(session, attempt), []);

  return {
    state,
    start: () => void start(),
    stop,
    cancel,
    dismissError: () => dispatch({ type: "dismissed" }),
  };
}

function stopTracks(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

function releaseOnUnmount(
  session: React.RefObject<RecordingSession | null>,
  attempt: React.RefObject<number>,
) {
  attempt.current++;
  const current = session.current;
  if (!current) return;
  current.cancelled = true;
  if (current.recorder.state !== "inactive") current.recorder.stop();
  stopTracks(current.stream);
}
