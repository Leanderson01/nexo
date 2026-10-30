"use client";

import { Button, Group, Modal, Text } from "@mantine/core";

import { DAILY_LIMIT_TEXT } from "./chat-texts";

/** O aviso do teto diário no "Nova conversa": em vez de criar, oferece "Falar com um analista". */
export function DailyLimitNotice({
  opened,
  isCreating,
  onTalkToAnalyst,
  onClose,
}: {
  opened: boolean;
  isCreating: boolean;
  onTalkToAnalyst: () => void;
  onClose: () => void;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700}>Nova conversa</Text>} centered>
      <Text size="sm">{DAILY_LIMIT_TEXT}</Text>
      <Text size="sm" c="dimmed" mt="xs">
        Se escolher falar com um analista, a conversa nova já vai para a fila do atendimento.
      </Text>
      <Group justify="flex-end" gap="xs" mt="md">
        <Button variant="default" size="xs" onClick={onClose} disabled={isCreating}>
          Agora não
        </Button>
        <Button size="xs" loading={isCreating} onClick={onTalkToAnalyst}>
          Falar com um analista
        </Button>
      </Group>
    </Modal>
  );
}
