"use client";

import { Badge, Code, Collapse, Group, Text, UnstyledButton } from "@mantine/core";
import { useState } from "react";

import type { DecisionRecord, PolicyEvaluation, ToolCallTrace } from "@/domain/decision-record";
import type { ConfidenceLevel, DecisionOutcome, Priority } from "@/domain/enums";
import { CONFIDENCE_LEVEL_LABELS, PRIORITY_LABELS } from "@/domain/labels";
import { explainPriority } from "@/domain/priority";

import classes from "./decision-panel.module.css";
import {
  DECISION_OUTCOME_LABELS,
  INTENT_LABELS,
  POLICY_OUTCOME_LABELS,
  describeEntities,
  describePrioritySignals,
  formatAttempts,
  formatConfidenceValue,
  formatCostUsd,
  formatDateTime,
  formatLatency,
  formatPriorityDeadline,
  formatTokens,
  type EntityRow,
} from "./format";

// Painel de decisão (§7.3): mostra, em linguagem simples, o que o agent entendeu, quais regras
// avaliou, o que fez e por quê. Recebe só o DecisionRecord; quem busca o registro é a gaveta.
// As 7 seções aparecem sempre, nesta ordem, inclusive quando não há nada a mostrar.

export const DECISION_PANEL_SECTIONS = [
  { id: "understanding", title: "O que entendi" },
  { id: "policies", title: "Regras aplicadas" },
  { id: "actions", title: "O que fiz" },
  { id: "priority", title: "Prioridade calculada" },
  { id: "confidence", title: "Segurança" },
  { id: "rationale", title: "Por quê" },
  { id: "usage", title: "Modelos e custo" },
] as const;

type SectionId = (typeof DECISION_PANEL_SECTIONS)[number]["id"];

const OUTCOME_COLORS: Record<DecisionOutcome, string> = {
  answered: "blue",
  asked_clarification: "grape",
  draft_proposed: "teal",
  handoff: "orange",
  redirected: "gray",
  error: "red",
};

const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  high: "green",
  medium: "yellow",
  low: "red",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  CRITICAL: "red",
  HIGH: "orange",
  MEDIUM: "yellow",
  LOW: "gray",
};

export function DecisionPanel({ record }: { record: DecisionRecord }) {
  return (
    <div className={classes.panel}>
      <PanelHeader record={record} />
      <Section id="understanding">
        <UnderstandingSection understanding={record.understanding} />
      </Section>
      <Section id="policies">
        <PoliciesSection policies={record.policies} />
      </Section>
      <Section id="actions">
        <ActionsSection actions={record.actions} />
      </Section>
      <Section id="priority">
        <PrioritySection record={record} />
      </Section>
      <Section id="confidence">
        <ConfidenceSection confidence={record.confidence} />
      </Section>
      <Section id="rationale">
        <Text size="sm" className={classes.prose}>
          {record.rationale}
        </Text>
      </Section>
      <Section id="usage">
        <UsageSection usage={record.usage} />
      </Section>
      <RawJson record={record} />
    </div>
  );
}

function PanelHeader({ record }: { record: DecisionRecord }) {
  return (
    <Group justify="space-between" gap="xs" className={classes.header}>
      <Badge tt="none" color={OUTCOME_COLORS[record.outcome]} variant="light" radius="sm">
        {DECISION_OUTCOME_LABELS[record.outcome]}
      </Badge>
      <Text size="xs" c="dimmed">
        {formatDateTime(record.createdAt)}
      </Text>
    </Group>
  );
}

function Section({ id, children }: { id: SectionId; children: React.ReactNode }) {
  const index = DECISION_PANEL_SECTIONS.findIndex((section) => section.id === id);
  const title = DECISION_PANEL_SECTIONS[index].title;
  const headingId = `decision-panel-${id}`;

  return (
    <section className={classes.section} data-section={id} aria-labelledby={headingId}>
      <h3 id={headingId} className={classes.sectionTitle}>
        <span className={classes.sectionNumber}>{index + 1}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <Text size="sm" c="dimmed">
      {children}
    </Text>
  );
}

function FieldList({ rows }: { rows: EntityRow[] }) {
  return (
    <dl className={classes.fields}>
      {rows.map((row) => (
        <div key={row.label} className={classes.field}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- 1. O que entendi ----------

function UnderstandingSection({
  understanding,
}: {
  understanding: DecisionRecord["understanding"];
}) {
  if (!understanding) {
    return (
      <EmptyNote>Não cheguei a entender a mensagem: o turno falhou antes dessa etapa.</EmptyNote>
    );
  }

  const entities = describeEntities(understanding);
  return (
    <>
      <Text size="sm" fw={500} className={classes.prose}>
        {understanding.summary}
      </Text>
      <FieldList
        rows={[{ label: "Intenção", value: INTENT_LABELS[understanding.intent] }, ...entities]}
      />
      {entities.length === 0 && (
        <Text size="xs" c="dimmed">
          Nenhum detalhe extra (sistema, erro, aparelho) apareceu na mensagem.
        </Text>
      )}
    </>
  );
}

// ---------- 2. Regras aplicadas ----------

function PoliciesSection({ policies }: { policies: PolicyEvaluation[] }) {
  if (policies.length === 0) {
    return <EmptyNote>Nenhuma regra foi avaliada neste turno.</EmptyNote>;
  }

  return (
    <ul className={classes.list}>
      {policies.map((policy) => (
        <li key={policy.name} className={classes.policy} data-outcome={policy.outcome}>
          <Text size="sm">
            <span className={classes.policyName}>{policy.name}:</span>{" "}
            <span className={classes.policyOutcome}>{POLICY_OUTCOME_LABELS[policy.outcome]}</span>
            {policy.outcome === "triggered" ? "." : null}
          </Text>
          {policy.explanation && (
            <Text size="sm" c={policy.outcome === "triggered" ? undefined : "dimmed"}>
              {policy.explanation}
            </Text>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------- 3. O que fiz ----------

function ActionsSection({ actions }: { actions: ToolCallTrace[] }) {
  if (actions.length === 0) {
    return <EmptyNote>Não usei nenhuma ferramenta neste turno.</EmptyNote>;
  }

  return (
    <ol className={classes.list}>
      {actions.map((action, index) => (
        <ActionItem key={index} action={action} step={index + 1} />
      ))}
    </ol>
  );
}

function ActionItem({ action, step }: { action: ToolCallTrace; step: number }) {
  const failed = action.status === "error";
  return (
    <li className={classes.action} data-status={action.status}>
      <span className={classes.actionStep}>{step}</span>
      <div className={classes.actionBody}>
        <Group gap={6} wrap="wrap">
          <Text size="sm" fw={600}>
            {capitalize(action.label)}
          </Text>
          <Code className={classes.toolName}>{action.tool}</Code>
        </Group>
        <FieldList
          rows={[
            { label: "Entrada", value: action.inputSummary },
            { label: "Resultado", value: action.outputSummary },
          ]}
        />
        <Group gap={8} className={classes.actionMeta}>
          <Badge tt="none" size="xs" radius="sm" variant="light" color={failed ? "red" : "green"}>
            {failed ? "Falhou" : "Funcionou"}
          </Badge>
          <Text size="xs" c="dimmed">
            {formatAttempts(action)} · {formatLatency(action.latencyMs)}
          </Text>
        </Group>
      </div>
    </li>
  );
}

// ---------- 4. Prioridade calculada ----------

function PrioritySection({ record }: { record: DecisionRecord }) {
  const priority = record.derived?.priority;
  if (!priority) {
    return <EmptyNote>Não se aplica: este turno não classificou nenhum chamado.</EmptyNote>;
  }

  const signals = record.understanding ? describePrioritySignals(record.understanding.signals) : [];
  return (
    <>
      <Group gap={8}>
        <Badge tt="none" color={PRIORITY_COLORS[priority.value]} variant="light" radius="sm">
          {PRIORITY_LABELS[priority.value]}
        </Badge>
        <Text size="sm">
          {explainPriority({ priority: priority.value, reason: priority.reason })}
        </Text>
      </Group>
      <FieldList
        rows={[
          ...signals.map((row) => ({
            label: `Sinal: ${row.label.toLowerCase()}`,
            value: row.value,
          })),
          { label: "Regra aplicada", value: priority.reason },
          { label: "Prazo", value: formatPriorityDeadline(priority.value, priority.dueAt) },
        ]}
      />
    </>
  );
}

// ---------- 5. Segurança ----------

function ConfidenceSection({ confidence }: { confidence: DecisionRecord["confidence"] }) {
  if (!confidence) {
    return <EmptyNote>Sem avaliação: o turno falhou antes de medir a segurança.</EmptyNote>;
  }

  return (
    <>
      <Group gap={8}>
        <Badge tt="none" color={CONFIDENCE_COLORS[confidence.level]} variant="light" radius="sm">
          {CONFIDENCE_LEVEL_LABELS[confidence.level]}
        </Badge>
        <Text size="sm" fw={600}>
          {formatConfidenceValue(confidence.value)}
        </Text>
        <Text size="xs" c="dimmed">
          de 0 a 1
        </Text>
      </Group>
      <Text size="sm" className={classes.prose}>
        {confidence.reason}
      </Text>
    </>
  );
}

// ---------- 7. Rodapé ----------

function UsageSection({ usage }: { usage: DecisionRecord["usage"] }) {
  const models = usage.models.length > 0 ? usage.models.join(", ") : "nenhum modelo chamado";
  return (
    <FieldList
      rows={[
        { label: "Modelos", value: models },
        {
          label: "Tokens",
          value: `${formatTokens(usage.inputTokens)} de entrada · ${formatTokens(usage.outputTokens)} de saída`,
        },
        { label: "Custo estimado", value: formatCostUsd(usage.estimatedCostUsd) },
        { label: "Tempo do turno", value: formatLatency(usage.latencyMs) },
      ]}
    />
  );
}

function RawJson({ record }: { record: DecisionRecord }) {
  const [opened, setOpened] = useState(false);
  return (
    <div className={classes.rawJson}>
      <UnstyledButton
        className={classes.rawJsonToggle}
        onClick={() => setOpened((value) => !value)}
        aria-expanded={opened}
      >
        {opened ? "esconder JSON" : "ver JSON"}
      </UnstyledButton>
      <Collapse expanded={opened}>
        <Code block className={classes.rawJsonCode}>
          {JSON.stringify(record, null, 2)}
        </Code>
      </Collapse>
    </div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
