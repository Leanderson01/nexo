"use client";

import { Button, Group, Paper, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";

import { DecisionPanel } from "@/features/decision-panel/decision-panel";
import { DecisionPanelDrawerFrame } from "@/features/decision-panel/decision-panel-drawer";
import { DECISION_FIXTURES } from "@/features/decision-panel/fixtures";

/** Escolhe um cenário e mostra o painel na página e na gaveta lateral. */
export function DecisionPanelGallery() {
  const [selectedId, setSelectedId] = useState(DECISION_FIXTURES[0].id);
  const [drawerOpened, setDrawerOpened] = useState(false);
  const selected =
    DECISION_FIXTURES.find((fixture) => fixture.id === selectedId) ?? DECISION_FIXTURES[0];

  return (
    <Stack maw={560} mx="auto" px="md" py="xl" gap="md">
      <div>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          Desenvolvimento
        </Text>
        <Title order={2} size="h3">
          Painel de decisão
        </Title>
        <Text size="sm" c="dimmed">
          Registros falsos tirados dos cenários da spec (src/features/decision-panel/fixtures.ts).
        </Text>
      </div>

      <SegmentedControl
        orientation="vertical"
        fullWidth
        value={selectedId}
        onChange={setSelectedId}
        data={DECISION_FIXTURES.map((fixture) => ({ value: fixture.id, label: fixture.title }))}
      />

      <Group justify="flex-end">
        <Button size="xs" variant="light" onClick={() => setDrawerOpened(true)}>
          Abrir na gaveta
        </Button>
      </Group>

      <Paper withBorder radius="md" p="md">
        <DecisionPanel key={selected.id} record={selected.record} />
      </Paper>

      <DecisionPanelDrawerFrame opened={drawerOpened} onClose={() => setDrawerOpened(false)}>
        <DecisionPanel record={selected.record} />
      </DecisionPanelDrawerFrame>
    </Stack>
  );
}
