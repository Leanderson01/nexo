"use client";

import { Button, Group, Modal, Text } from "@mantine/core";

import { DAILY_LIMIT_TEXT } from "./chat-texts";

/**
 * O aviso do teto diário no "Nova conversa": o agent não responde hoje, então oferece escrever
 * o pedido para um analista. Nada vai para a fila antes de a pessoa escrever.
 */
export function DailyLimitNotice({
  opened,
  isCreating,
  onWriteToAnalyst,
  onClose,
}: {
  opened: boolean;
  isCreating: boolean;
  onWriteToAnalyst: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text fz={15} fw={600}>
          Nova conversa
        </Text>
      }
      centered
    >
      <Text size="sm">{DAILY_LIMIT_TEXT}</Text>
      <Text size="sm" c="dimmed" mt="xs">
        Escreva seu pedido na conversa nova e toque em “Falar com um analista”: ele vai para a fila
        do atendimento junto com a sua mensagem.
      </Text>
      <Group justify="flex-end" gap="xs" mt="md">
        <Button variant="default" size="xs" onClick={onClose} disabled={isCreating}>
          Agora não
        </Button>
        <Button size="xs" loading={isCreating} onClick={onWriteToAnalyst}>
          Escrever para um analista
        </Button>
      </Group>
    </Modal>
  );
}
