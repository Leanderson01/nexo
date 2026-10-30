"use client";

import { Button, Drawer, Skeleton, Stack, Text } from "@mantine/core";
import { catchError, type ErrorInfo } from "next/error";
import { useCallback, useState } from "react";

import { useSignedInQuery } from "@/features/auth/use-signed-in-query";
import { api } from "../../../convex/_generated/api";
import { DecisionPanel } from "./decision-panel";

// Gaveta lateral do painel de decisão (§7.3). O chat (T7) e o console (T12) ligam assim:
//
//   const decisionPanel = useDecisionPanel();
//   <Anchor onClick={() => decisionPanel.open(message.decisionId)}>Ver detalhes</Anchor>
//   <DecisionPanelDrawer decisionId={decisionPanel.decisionId} onClose={decisionPanel.close} />

/**
 * Id de um registro em `decisions`. Como no resto do chat, circula como `string`: a query
 * normaliza o id e devolve `null` para id inválido, inexistente ou alheio.
 */
export type DecisionId = string;

/** Qual registro a gaveta mostra; `null` = gaveta fechada. */
export function useDecisionPanel() {
  const [decisionId, setDecisionId] = useState<DecisionId | null>(null);
  const open = useCallback((id: DecisionId) => setDecisionId(id), []);
  const close = useCallback(() => setDecisionId(null), []);
  return { decisionId, open, close };
}

interface DecisionPanelDrawerProps {
  decisionId: DecisionId | null;
  onClose: () => void;
}

export function DecisionPanelDrawer({ decisionId, onClose }: DecisionPanelDrawerProps) {
  return (
    <DecisionPanelDrawerFrame opened={decisionId !== null} onClose={onClose}>
      {decisionId !== null && (
        <DecisionPanelErrorBoundary>
          <LoadedDecisionPanel decisionId={decisionId} />
        </DecisionPanelErrorBoundary>
      )}
    </DecisionPanelDrawerFrame>
  );
}

interface DecisionPanelDrawerFrameProps {
  opened: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/** A moldura da gaveta, sem dados; a página de fixtures usa direto com um registro falso. */
export function DecisionPanelDrawerFrame({
  opened,
  onClose,
  children,
}: DecisionPanelDrawerFrameProps) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="md"
      title={<Text fw={700}>Por que o Nexo fez isso</Text>}
      closeButtonProps={{ "aria-label": "Fechar painel de decisão" }}
    >
      {children}
    </Drawer>
  );
}

/** Busca o registro com uma query reativa; `undefined` enquanto carrega, `null` sem acesso. */
function LoadedDecisionPanel({ decisionId }: { decisionId: DecisionId }) {
  const record = useSignedInQuery(api.decisionPanel.get, { decisionId });

  if (record === undefined) return <DecisionPanelSkeleton />;
  if (record === null) {
    return (
      <Stack gap={4} py="xl" ta="center">
        <Text fw={600}>Detalhes não encontrados.</Text>
        <Text size="sm" c="dimmed">
          Este registro não existe ou não está disponível para você.
        </Text>
      </Stack>
    );
  }
  return <DecisionPanel record={record} />;
}

function DecisionPanelSkeleton() {
  return (
    <Stack gap="lg" aria-label="Carregando detalhes" aria-busy>
      <Skeleton height={22} width="40%" />
      {[0, 1, 2, 3].map((index) => (
        <Stack key={index} gap={8}>
          <Skeleton height={10} width="30%" />
          <Skeleton height={14} />
          <Skeleton height={14} width="80%" />
        </Stack>
      ))}
    </Stack>
  );
}

/** Erro inesperado (rede, sessão): mensagem amigável no lugar do painel, sem detalhe técnico. */
function DecisionPanelErrorFallback(_props: object, { error, retry }: ErrorInfo) {
  console.error("[painel de decisão] erro ao carregar o registro", error);
  return (
    <Stack align="center" gap="sm" py="xl" ta="center" role="alert">
      <Text fw={600}>Não conseguimos carregar os detalhes.</Text>
      <Text size="sm" c="dimmed">
        Verifique sua conexão e tente de novo.
      </Text>
      <Button size="xs" onClick={() => retry()}>
        Tentar de novo
      </Button>
    </Stack>
  );
}

const DecisionPanelErrorBoundary = catchError(DecisionPanelErrorFallback);
