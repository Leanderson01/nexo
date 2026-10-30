import { Stack, Text } from "@mantine/core";

import { ChatBubbleIcon } from "@/features/chat/icons";
import classes from "./console.module.css";

/** Área da conversa vazia: nenhuma conversa aberta ainda. */
export function NoConversationSelected() {
  return (
    <div className={classes.emptyMain}>
      <Stack align="center" gap={6} c="gray.6">
        <ChatBubbleIcon size={28} />
        <Text fw={600} c="dark.6">
          Selecione uma conversa
        </Text>
        <Text size="sm" c="dimmed" maw={320}>
          A fila mostra primeiro quem espera um atendente, com os casos críticos na frente.
        </Text>
      </Stack>
    </div>
  );
}
