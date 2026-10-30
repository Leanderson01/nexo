"use client";

import { ActionIcon, CloseButton, Group, Loader, Text, Tooltip } from "@mantine/core";

import { MAX_RECORDING_SECONDS } from "./audio-format";
import { MicrophoneIcon, CloseIcon, StopIcon } from "./icons";
import { formatElapsed } from "./recorder-state";
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
            <MicrophoneIcon size={18} />
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
              <CloseIcon size={16} />
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
              <StopIcon size={14} />
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

export function VoiceNotice({ voice }: { voice: VoiceRecorder }) {
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
