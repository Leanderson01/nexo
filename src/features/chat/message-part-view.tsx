"use client";

import { Alert, Button, Group, Paper, Stack, Text } from "@mantine/core";

import type { MessagePart } from "@/domain/message-parts";
import classes from "./chat.module.css";
import { conversationEventText, handoffBannerText } from "./chat-texts";

// Um componente por `type` de MessagePart (§7.2). Texto, evento, transferência e erro já
// são os definitivos; artigo, chamado, seletor, rascunho e opções rápidas têm aqui um
// fallback simples, que a T7 troca pelos blocos ricos do protótipo.

export interface PartActions {
  /** Envia um texto como mensagem do funcionário (opções rápidas, seletor). */
  onSend: (text: string) => void;
  /** Falso quando o bloco já foi usado ou o campo está bloqueado. */
  interactive: boolean;
}

export function MessagePartView({ part, actions }: { part: MessagePart; actions: PartActions }) {
  switch (part.type) {
    case "text":
      return <p className={classes.text}>{part.text}</p>;
    case "event":
      return (
        <div className={classes.event}>{conversationEventText(part.kind, part.actorName)}</div>
      );
    case "handoff":
      return <HandoffBanner reason={part.reason} outOfHours={part.outOfHours} />;
    case "error":
      return (
        <Alert color="red" variant="light" p="xs">
          {part.message}
        </Alert>
      );
    case "article":
      return (
        <FallbackCard label="Central de ajuda" title={part.title}>
          {part.excerpt}
        </FallbackCard>
      );
    case "ticket":
      return <FallbackCard label="Chamado" title={part.code} />;
    case "draft":
      // O estado (pendente, confirmado, cancelado) vem de `pendingActions`: fica para o card rico.
      return <FallbackCard label="Rascunho" title="Rascunho de chamado" />;
    case "ticketSelector":
      return (
        <ChoiceButtons
          prompt={part.prompt}
          choices={part.codes.map((code) => ({ label: code, text: code }))}
          actions={actions}
        />
      );
    case "quickReplies":
      return (
        <ChoiceButtons
          choices={part.options.map((option) => ({ label: option.label, text: option.label }))}
          actions={actions}
        />
      );
  }
}

function HandoffBanner({
  reason,
  outOfHours,
}: Pick<Extract<MessagePart, { type: "handoff" }>, "reason" | "outOfHours">) {
  const { title, outOfHoursNote } = handoffBannerText(reason, outOfHours);
  return (
    <Alert color="orange" variant="light" p="sm" w="100%">
      <Text size="sm" fw={500}>
        {title}
      </Text>
      {outOfHoursNote && (
        <Text size="xs" mt={4}>
          {outOfHoursNote}
        </Text>
      )}
    </Alert>
  );
}

function FallbackCard({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={600}>
        {title}
      </Text>
      {children && (
        <Text size="sm" c="dimmed" mt={2}>
          {children}
        </Text>
      )}
    </Paper>
  );
}

function ChoiceButtons({
  prompt,
  choices,
  actions,
}: {
  prompt?: string;
  choices: { label: string; text: string }[];
  actions: PartActions;
}) {
  return (
    <Stack gap={6}>
      {prompt && <Text size="sm">{prompt}</Text>}
      <Group gap={6}>
        {choices.map((choice) => (
          <Button
            key={choice.label}
            variant="default"
            size="xs"
            disabled={!actions.interactive}
            onClick={() => actions.onSend(choice.text)}
          >
            {choice.label}
          </Button>
        ))}
      </Group>
    </Stack>
  );
}
