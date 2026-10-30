"use client";

import { Button, Group, Loader, Text, Textarea } from "@mantine/core";
import { useState, type KeyboardEvent } from "react";

import { appendTranscript, isBusy } from "@/features/voice/recorder-state";
import { useVoiceRecorder } from "@/features/voice/use-voice-recorder";
import { VoiceButton, VoiceNotice } from "@/features/voice/voice-controls";
import { ICON_SIZE, SendIcon } from "@/shared/icons";
import classes from "./chat.module.css";
import { DAILY_LIMIT_TEXT } from "./chat-texts";
import { canType, getCounterTone, type ComposerState } from "./composer-state";

interface ComposerProps {
  state: ComposerState;
  employeeMessageCount: number;
  messageLimit: number;
  /**
   * Envio otimista (UX1): o campo é limpo na hora e a mensagem aparece na conversa com o
   * reloginho; se a rota falhar, o erro e o "Tentar de novo" ficam na própria mensagem.
   */
  onSend: (text: string) => void;
  onNewConversation: (options: { inheritSummary: boolean }) => void;
  isCreatingConversation: boolean;
  /** Só existe com a conversa em `agent`: "Falar com um analista" no limite e no teto diário. */
  onRequestAnalyst?: () => void;
}

/** Campo de mensagem com os estados da §7.2 (e o teto diário) e o contador sempre visível. */
export function Composer(props: ComposerProps) {
  const { state } = props;
  const [text, setText] = useState("");
  const enabled = canType(state);
  // O texto falado entra no campo para revisar; nada é enviado sozinho (§11.1).
  const voice = useVoiceRecorder({
    disabled: !enabled,
    onTranscribed: (spoken) => setText((current) => appendTranscript(current, spoken)),
  });
  const canUseButton = enabled && !isBusy(voice.state);
  const canSend = canUseButton && text.trim() !== "";

  function submit() {
    if (!canSend) return;
    props.onSend(text);
    setText("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra a linha.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className={classes.composerArea}>
      <ComposerNotice {...props} />
      <VoiceNotice voice={voice} />
      <div className={classes.composerBox}>
        <Textarea
          aria-label="Mensagem"
          placeholder={
            state === "analyst" ? "Escreva para o analista..." : "Escreva para o Nexo..."
          }
          variant="unstyled"
          autosize
          minRows={1}
          maxRows={6}
          classNames={{ root: classes.composerInput, input: classes.composerTextarea }}
          value={text}
          disabled={!canType(state)}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        <VoiceButton voice={voice} disabled={!enabled} />
        {/* Como no print, o botão fica azul com o campo vazio; sem texto, o clique não faz nada. */}
        <Button
          className={classes.sendButton}
          leftSection={<SendIcon size={ICON_SIZE.sm} />}
          disabled={!canUseButton}
          onClick={submit}
        >
          Enviar
        </Button>
      </div>
      <div
        className={classes.counter}
        data-tone={getCounterTone(props.employeeMessageCount, props.messageLimit)}
      >
        {props.employeeMessageCount}/{props.messageLimit} mensagens nesta sessão
      </div>
    </div>
  );
}

function ComposerNotice(props: ComposerProps) {
  switch (props.state) {
    case "ready":
      return null;
    case "agent_busy":
      return (
        <Group gap={8} mb={8}>
          <Loader size={12} />
          <Text size="xs" c="dimmed">
            O Nexo Assist está respondendo...
          </Text>
        </Group>
      );
    case "analyst":
      return (
        <Text size="xs" c="dimmed" mb={8}>
          Suas mensagens vão para o analista.
        </Text>
      );
    case "limit_reached":
      return (
        <BlockedNotice
          message={`Esta conversa chegou ao limite de ${props.messageLimit} mensagens.`}
        >
          <Button
            size="xs"
            loading={props.isCreatingConversation}
            onClick={() => props.onNewConversation({ inheritSummary: true })}
          >
            Nova conversa (com resumo desta)
          </Button>
          {props.onRequestAnalyst && (
            <Button size="xs" variant="default" onClick={props.onRequestAnalyst}>
              Falar com um analista
            </Button>
          )}
        </BlockedNotice>
      );
    case "daily_limit":
      return (
        <BlockedNotice message={DAILY_LIMIT_TEXT}>
          {props.onRequestAnalyst && (
            <Button size="xs" onClick={props.onRequestAnalyst}>
              Falar com um analista
            </Button>
          )}
        </BlockedNotice>
      );
    case "closed":
      return (
        <BlockedNotice message="Esta conversa foi encerrada.">
          <Button
            size="xs"
            loading={props.isCreatingConversation}
            onClick={() => props.onNewConversation({ inheritSummary: false })}
          >
            Nova conversa
          </Button>
        </BlockedNotice>
      );
  }
}

function BlockedNotice({ message, children }: { message: string; children: React.ReactNode }) {
  return (
    <Group className={classes.notice} justify="space-between" gap={8}>
      <Text size="sm">{message}</Text>
      <Group gap={6}>{children}</Group>
    </Group>
  );
}
