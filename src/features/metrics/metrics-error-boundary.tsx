"use client";

import { Button, Stack, Text } from "@mantine/core";
import { catchError, type ErrorInfo } from "next/error";

import classes from "./metrics.module.css";

/** Erro ao carregar as métricas (§10): mensagem amigável e "Tentar de novo". */
function MetricsErrorFallback(_props: object, { error, retry }: ErrorInfo) {
  console.error("[métricas] erro inesperado na tela", error);
  return (
    <div className={classes.errorBox} role="alert">
      <Stack align="center" gap="sm">
        <Text fw={600}>Não conseguimos carregar as métricas.</Text>
        <Text size="sm" c="dimmed">
          Verifique sua conexão e tente de novo.
        </Text>
        <Button size="xs" onClick={() => retry()}>
          Tentar de novo
        </Button>
      </Stack>
    </div>
  );
}

export const MetricsErrorBoundary = catchError(MetricsErrorFallback);
