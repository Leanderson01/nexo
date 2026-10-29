"use client";

import { Button, Stack, Text } from "@mantine/core";
import { catchError, type ErrorInfo } from "next/error";

/**
 * Error boundary da área do chat (§10): mensagem amigável e "Tentar de novo", sem detalhes
 * técnicos. O erro vai para o console do navegador para quem estiver depurando.
 */
function ChatErrorFallback(_props: object, { error, retry }: ErrorInfo) {
  console.error("[chat] erro inesperado na tela", error);
  return (
    <Stack align="center" gap="sm" py={96} ta="center" role="alert">
      <Text fw={600}>Não conseguimos carregar a conversa.</Text>
      <Text size="sm" c="dimmed">
        Verifique sua conexão e tente de novo. Suas mensagens continuam salvas.
      </Text>
      <Button size="xs" onClick={() => retry()}>
        Tentar de novo
      </Button>
    </Stack>
  );
}

export const ChatErrorBoundary = catchError(ChatErrorFallback);
