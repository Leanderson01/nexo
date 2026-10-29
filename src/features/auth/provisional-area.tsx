"use client";

import { Container, Group, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { SignOutButton } from "./sign-out-button";

/**
 * PROVISÓRIO (T2): só mostra quem entrou, para testar o redirecionamento por papel.
 * O chat (T5) e o console (T12) substituem as páginas que usam este componente.
 */
export function ProvisionalArea({ areaName }: { areaName: string }) {
  const person = useQuery(api.auth.currentPerson);

  return (
    <Container size="sm" py="xl">
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Title order={2}>{areaName}</Title>
          <Text c="dimmed" size="sm">
            {person
              ? `Você entrou como ${person.name} (${person.email}).`
              : "Carregando sua sessão..."}
          </Text>
          <Text c="dimmed" size="sm">
            Página provisória: esta tela ainda vai ser construída.
          </Text>
        </Stack>
        <SignOutButton />
      </Group>
    </Container>
  );
}
