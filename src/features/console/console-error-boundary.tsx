"use client";

import { Button, Stack, Text } from "@mantine/core";
import { catchError, type ErrorInfo } from "next/error";

import classes from "./console.module.css";

/**
 * Error boundary da conversa no console (§10): mensagem amigável e "Tentar de novo". O erro
 * vai para o console do navegador para quem estiver depurando.
 */
function ConsoleErrorFallback(_props: object, { error, retry }: ErrorInfo) {
  console.error("[console] erro inesperado na tela", error);
  return (
    <div className={classes.emptyMain} role="alert">
      <Stack align="center" gap="sm">
        <Text fw={600}>Não conseguimos carregar esta conversa.</Text>
        <Text size="sm" c="dimmed">
          Verifique sua conexão e tente de novo. Nada do atendimento se perdeu.
        </Text>
        <Button size="xs" onClick={() => retry()}>
          Tentar de novo
        </Button>
      </Stack>
    </div>
  );
}

export const ConsoleErrorBoundary = catchError(ConsoleErrorFallback);
