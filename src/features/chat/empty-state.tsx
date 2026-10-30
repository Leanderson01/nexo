"use client";

import { Button, Group, Stack, Text, Title } from "@mantine/core";

/** Sugestões iniciais (§11.4): o clique envia o texto como mensagem. */
export const INITIAL_SUGGESTIONS = [
  "Minha VPN não conecta",
  "Ver meus chamados",
  "Preciso de um acesso",
  "Meu computador está lento",
] as const;

export function EmptyState({
  firstName,
  onSend,
  disabled,
}: {
  firstName: string | null;
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  return (
    // my="auto": a coluna assenta as mensagens no fim; o estado vazio fica no meio.
    <Stack align="center" gap="xs" py={72} my="auto" ta="center">
      <Title order={3} fw={600}>
        {firstName ? `Olá, ${firstName}! Como posso ajudar?` : "Como posso ajudar?"}
      </Title>
      <Text c="dimmed" size="sm" maw={440}>
        Conte o problema com suas palavras. Eu consulto seus chamados, busco na central de ajuda e,
        se precisar, preparo um chamado para você confirmar.
      </Text>
      <Group justify="center" gap={8} mt="md">
        {INITIAL_SUGGESTIONS.map((suggestion) => (
          <Button
            key={suggestion}
            variant="default"
            disabled={disabled}
            onClick={() => onSend(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </Group>
    </Stack>
  );
}
