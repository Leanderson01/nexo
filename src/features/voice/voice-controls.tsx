"use client";

import { ActionIcon, CloseButton, Group, Loader, Text, Tooltip } from "@mantine/core";

import { MAX_RECORDING_SECONDS } from "./audio-format";
import { CloseIcon, ICON_SIZE, MicrophoneIcon, StopIcon } from "@/shared/icons";
import { SILENCE_WARNING, formatElapsed, shouldWarnSilence } from "./recorder-state";
import type { VoiceRecorder } from "./use-voice-recorder";
import classes from "./voice.module.css";

// O microfone do campo de mensagem (§7.2, §11.1). `VoiceButton` fica na linha do campo, ao
// lado do "Enviar"; `VoiceNotice` mostra o erro logo acima do campo.

export function VoiceButton({ voice, disabled }: { voice: VoiceRecorder; disabled: boolean }) {
  const { state } = voice;
  switch (state.status) {
    case "idle":
    case "error":
      return (
        <Tooltip label="Gravar mensagem de voz (até 1 minuto)" disabled={disabled}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size={36}
            aria-label="Gravar mensagem de voz"
            disabled={disabled}
            onClick={voice.start}
          >
            <MicrophoneIcon size={ICON_SIZE.lg} />
          </ActionIcon>
        </Tooltip>
      );
    case "requesting_permission":
      return (
        <ActionIcon
          variant="subtle"
          color="gray"
          size={36}
          loading
          aria-label="Pedindo acesso ao microfone"
        />
      );
    case "recording":
      return (
        <Group gap={4} wrap="nowrap" className={classes.recording} role="status">
          <span className={classes.recordingDot} aria-hidden />
          <LevelMeter level={state.level} />
          <Text size="sm" className={classes.elapsed} aria-label="Tempo de gravação">
            {formatElapsed(state.elapsedSeconds)}
            <span className={classes.elapsedLimit}> / {formatElapsed(MAX_RECORDING_SECONDS)}</span>
          </Text>
          <Tooltip label="Descartar gravação">
            <ActionIcon
              variant="subtle"
              color="gray"
              size={30}
              aria-label="Descartar gravação"
              onClick={voice.cancel}
            >
              <CloseIcon />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Parar e transcrever">
            <ActionIcon
              variant="filled"
              color="red"
              size={30}
              aria-label="Parar e transcrever"
              onClick={voice.stop}
            >
              <StopIcon size={ICON_SIZE.sm} />
            </ActionIcon>
          </Tooltip>
        </Group>
      );
    case "transcribing":
      return (
        <Group gap={6} wrap="nowrap" px={6} role="status">
          <Loader size={14} />
          <Text size="sm" c="dimmed">
            Transcrevendo...
          </Text>
        </Group>
      );
  }
}

/** Barrinhas que sobem com a voz: a pessoa vê que o microfone está captando. */
function LevelMeter({ level }: { level: number }) {
  return (
    <span className={classes.meter} aria-hidden data-testid="voice-level">
      {METER_STEPS.map((step) => (
        <span key={step} className={classes.meterBar} data-on={level >= step} />
      ))}
    </span>
  );
}

const METER_STEPS = [0.05, 0.3, 0.55, 0.8];

export function VoiceNotice({ voice }: { voice: VoiceRecorder }) {
  if (shouldWarnSilence(voice.state)) {
    return (
      <Text size="xs" c="dimmed" mb={8} role="status">
        {SILENCE_WARNING}
      </Text>
    );
  }
  if (voice.state.status !== "error") return null;
  return (
    <Group gap={6} mb={8} wrap="nowrap" justify="space-between" className={classes.error}>
      <Text size="xs" c="red.7" role="alert">
        {voice.state.message}
      </Text>
      <CloseButton size="sm" aria-label="Fechar aviso" onClick={voice.dismissError} />
    </Group>
  );
}
