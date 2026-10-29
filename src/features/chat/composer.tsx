"use client";

import { Button, Group, Loader, Paper, Text, Textarea } from "@mantine/core";
import { useState, type KeyboardEvent } from "react";

import classes from "./chat.module.css";
import { canType, getCounterTone, type ComposerState } from "./composer-state";
import { ArrowUpIcon } from "./icons";

interface ComposerProps {
  state: ComposerState;
  employeeMessageCount: number;
  messageLimit: number;
  isSending: boolean;
  /** Devolve true se a mensagem foi aceita; só então o campo é limpo. */
  onSend: (text: string) => Promise<boolean>;
  onNewConversation: (options: { inheritSummary: boolean }) => void;
  isCreatingConversation: boolean;
  /** Só existe com a conversa em `agent`: "Falar com um analista" no limite. */
  onRequestAnalyst?: () => void;
}

/** Campo de mensagem com os cinco estados da §7.2 e o contador sempre visível. */
export function Composer(props: ComposerProps) {
  const { state, isSending } = props;
  const [text, setText] = useState("");
  const enabled = canType(state) && !isSending;

  async function submit() {
    if (!enabled || text.trim() === "") return;
    const accepted = await props.onSend(text);
    if (accepted) setText("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra a linha.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div className={classes.composerArea}>
      <ComposerNotice {...props} />
      <Paper withBorder radius="md" p={6}>
        <Group gap={6} align="flex-end" wrap="nowrap">
          <Textarea
            aria-label="Mensagem"
            placeholder={
              state === "analyst" ? "Escreva para o analista..." : "Escreva para o Nexo..."
            }
            variant="unstyled"
            autosize
            minRows={1}
            maxRows={6}
            px={8}
            style={{ flex: 1 }}
            value={text}
            disabled={!canType(state)}
            onChange={(event) => setText(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
          <Button
            leftSection={<ArrowUpIcon size={14} />}
            loading={isSending}
            disabled={!enabled || text.trim() === ""}
            onClick={() => void submit()}
          >
            Enviar
          </Button>
        </Group>
      </Paper>
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
    <Paper bg="gray.0" radius="md" p="sm" mb={8}>
      <Group justify="space-between" gap={8}>
        <Text size="sm">{message}</Text>
        <Group gap={6}>{children}</Group>
      </Group>
    </Paper>
  );
}
