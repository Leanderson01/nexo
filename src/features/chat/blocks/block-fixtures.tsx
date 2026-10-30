"use client";

import { Stack, Text, Title } from "@mantine/core";
import { useState } from "react";

import type { PendingAction } from "@/domain/pending-action";
import type { NewTicket } from "@/domain/ticket";
import chatClasses from "../chat.module.css";
import { ArticleCard } from "./article-card";
import { ConversationEventLine } from "./conversation-event";
import { DraftCard, type DraftCallbacks, type DraftCardData } from "./draft-card";
import { ErrorBlock } from "./error-block";
import { HandoffBanner } from "./handoff-banner";
import { QuickReplies } from "./quick-replies";
import { ReplyBubble } from "./reply-bubble";
import { ActionChips, ReplyHeader } from "./reply-header";
import { TicketCard, TicketCardSkeleton, TicketNotFound, type TicketCardData } from "./ticket-card";
import { TicketSelector } from "./ticket-selector";
import { TypingBubble } from "./typing-bubble";

// Página interna (/dev/blocos) com todos os blocos e estados, com dados falsos e sem Convex.
// O relógio é fixo (quarta, 28/10/2026, 10:00 em São Paulo) para os selos de prazo saírem
// sempre iguais.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 28, 13, 0);

const VPN_TICKET: NewTicket = {
  kind: "INC",
  category: "network_vpn",
  title: "VPN não conecta no notebook — erro 809",
  description:
    "Desde 20/10 o notebook (Windows 11) não conecta na VPN e mostra o erro 809. Precisa dela para a reunião das 14h.",
  affected: "Somente você",
  prioritySignals: { impact: "individual", blocked: false, deadlineToday: true },
  priority: "HIGH",
  priorityReason: "Compromisso hoje em risco",
};

function draft(overrides: Partial<DraftCardData>): DraftCardData {
  return {
    id: "fixture",
    draftNumber: 381,
    action: { kind: "create_ticket", ticket: VPN_TICKET },
    status: "pending",
    resultTicketCode: null,
    ...overrides,
  };
}

const NOTEBOOK_TICKET: TicketCardData = {
  code: "INC-20311",
  title: "Notebook lento após atualização do Windows",
  description:
    "Lentidão geral desde a atualização de 15/10. Reiniciar e rodar o diagnóstico da central não resolveu.",
  status: "awaiting_analyst",
  category: "hardware",
  priority: "MEDIUM",
  createdAt: NOW - 12 * DAY,
  lastActivityAt: NOW - 6 * DAY,
};

const SLA_EXAMPLES: { label: string; ticket: TicketCardData }[] = [
  {
    label: "No prazo",
    ticket: { ...NOTEBOOK_TICKET, status: "in_progress", lastActivityAt: NOW - 2 * HOUR },
  },
  {
    label: "Vence em 2h",
    ticket: {
      ...NOTEBOOK_TICKET,
      code: "INC-20402",
      title: "Outlook não sincroniza",
      status: "open",
      priority: "HIGH",
      lastActivityAt: NOW - 2 * HOUR,
    },
  },
  { label: "Vencido", ticket: NOTEBOOK_TICKET },
  {
    label: "Pausado (aguardando você)",
    ticket: { ...NOTEBOOK_TICKET, status: "awaiting_employee" },
  },
  { label: "Encerrado", ticket: { ...NOTEBOOK_TICKET, status: "resolved" } },
];

const SELECTOR_CHOICES = [
  {
    code: "INC-20311",
    ticket: {
      title: "Notebook lento após atualização",
      status: "awaiting_analyst" as const,
      createdAt: NOW - 12 * DAY,
    },
  },
  {
    code: "INC-20298",
    ticket: {
      title: "Acesso à pasta Financeiro no SharePoint",
      status: "in_progress" as const,
      createdAt: NOW - 14 * DAY,
    },
  },
  {
    code: "REQ-10442",
    ticket: {
      title: "Segundo monitor para home office",
      status: "approved" as const,
      createdAt: NOW - 19 * DAY,
    },
  },
];

const UPDATE_ACTION: PendingAction = {
  kind: "update_ticket",
  code: "INC-20395",
  text: "A impressora do 2º andar continua sem imprimir; agora o painel mostra o erro E-52.",
  fieldChanges: { priority: "HIGH", priorityReason: "Impede uma pessoa de trabalhar" },
};

const REOPEN_ACTION: PendingAction = {
  kind: "reopen_ticket",
  code: "INC-20150",
  reason: "A senha do SAP bloqueou de novo depois do desbloqueio de ontem.",
};

export function BlockFixtures() {
  const [log, setLog] = useState<string[]>([]);
  const record = (entry: string) => setLog((current) => [entry, ...current].slice(0, 5));

  const callbacks: DraftCallbacks = {
    onConfirm: (id) => record(`onConfirm(${id})`),
    onCancel: (id) => record(`onCancel(${id})`),
    onSaveEdit: (id, edited) => record(`onSaveEdit(${id}, ${JSON.stringify(edited)})`),
  };

  return (
    <div className={chatClasses.column}>
      <Stack gap={4}>
        <Title order={2}>Blocos de mensagem</Title>
        <Text size="sm" c="dimmed">
          Só em desenvolvimento. Relógio fixo em quarta, 28/10/2026, 10:00 (São Paulo).
        </Text>
        <Text size="xs" c="dimmed" ff="monospace">
          {log.length ? log.join("\n") : "Os callbacks clicados aparecem aqui."}
        </Text>
      </Stack>

      <Section title="Protótipo 02: opções rápidas e rascunho">
        <div className={chatClasses.reply}>
          <ReplyHeader author="Nexo Assist">
            <ActionChips
              labels={["consultou seus chamados", "buscou na central de ajuda"]}
              onShowDetails={() => record("onShowDetails(decisão 1)")}
            />
          </ReplyHeader>
          <ReplyBubble text="Não há chamado aberto sobre VPN, e o artigo do erro 809 vale só para Windows 10 — o seu é Windows 11. Vou abrir um chamado.">
            <QuickReplies
              options={["Só eu", "Minha equipe", "Toda a empresa", "Não sei"].map((label) => ({
                label,
                value: label,
              }))}
              chosenText="Só eu"
              interactive={false}
              onChoose={record}
            />
          </ReplyBubble>
        </div>
        <div className={chatClasses.userBubble}>
          Só eu. Tenho reunião com um cliente às 14h e preciso da VPN funcionando.
        </div>
        <div className={chatClasses.reply}>
          <ReplyHeader author="Nexo Assist">
            <ActionChips
              labels={["classificou a prioridade", "consultou o SLA", "montou o rascunho"]}
              onShowDetails={() => record("onShowDetails(decisão 2)")}
            />
          </ReplyHeader>
          <ReplyBubble text="Coloquei prioridade alta por causa da reunião — a resposta chega antes das 14h. Confira antes de eu criar:" />
          <DraftCard draft={draft({ id: "D-381" })} now={NOW} callbacks={callbacks} />
        </div>
      </Section>

      <Section title="Protótipo 03: seletor, chamado vencido e oferta de analista">
        <div className={chatClasses.reply}>
          <ReplyHeader author="Nexo Assist">
            <ActionChips labels={["consultou seus chamados"]} />
          </ReplyHeader>
          <ReplyBubble text="Você tem 3 chamados abertos. Sobre qual deles quer saber?" />
          <TicketSelector
            prompt="Sobre qual deles quer saber?"
            choices={SELECTOR_CHOICES}
            chosenText="INC-20311 · Notebook lento após atualização"
            interactive={false}
            onChoose={record}
          />
        </div>
        <div className={chatClasses.userBubble}>INC-20311 · Notebook lento após atualização</div>
        <div className={chatClasses.reply}>
          <ReplyHeader author="Nexo Assist">
            <ActionChips
              labels={["consultou o INC-20311", "calculou o prazo"]}
              onShowDetails={() => record("onShowDetails(decisão 3)")}
            />
          </ReplyHeader>
          <TicketCard ticket={NOTEBOOK_TICKET} now={NOW} />
          <ReplyBubble text="Está sem atualização há 6 dias, acima do prazo de 3 dias úteis para prioridade média. Quer que eu chame um analista?">
            <QuickReplies
              options={["Falar com um analista", "Adicionar informação", "Não, obrigado"].map(
                (label) => ({ label, value: label }),
              )}
              chosenText={null}
              interactive
              onChoose={record}
            />
          </ReplyBubble>
        </div>
      </Section>

      <Section title="Seletor ainda sem escolha">
        <TicketSelector
          prompt="Sobre qual deles quer saber?"
          choices={[...SELECTOR_CHOICES, { code: "INC-20999", ticket: null }]}
          chosenText={null}
          interactive
          onChoose={record}
        />
      </Section>

      <Section title="Selo de prazo do card de chamado">
        {SLA_EXAMPLES.map(({ label, ticket }) => (
          <Stack key={label} gap={4} w="100%">
            <Text size="xs" c="dimmed">
              {label}
            </Text>
            <TicketCard ticket={ticket} now={NOW} />
          </Stack>
        ))}
        <TicketCardSkeleton />
        <TicketNotFound code="INC-20388" />
      </Section>

      <Section title="Rascunho: estados finais e outros tipos">
        <DraftCard
          draft={draft({
            id: "D-380",
            draftNumber: 380,
            status: "confirmed",
            resultTicketCode: "INC-20420",
          })}
          now={NOW}
          callbacks={callbacks}
        />
        <DraftCard
          draft={draft({ id: "D-379", draftNumber: 379, status: "cancelled" })}
          now={NOW}
          callbacks={callbacks}
        />
        <DraftCard
          draft={draft({ id: "D-378", draftNumber: 378, status: "superseded" })}
          now={NOW}
          callbacks={callbacks}
        />
        <DraftCard
          draft={draft({ id: "D-382", draftNumber: 382, action: UPDATE_ACTION })}
          now={NOW}
          callbacks={callbacks}
        />
        <DraftCard
          draft={draft({ id: "D-383", draftNumber: 383, action: REOPEN_ACTION })}
          now={NOW}
          callbacks={callbacks}
        />
      </Section>

      <Section title="Artigo e digitação">
        <div className={chatClasses.reply}>
          <ReplyHeader author="Nexo Assist">
            <ActionChips labels={["buscou na central de ajuda"]} />
          </ReplyHeader>
          <ArticleCard
            title="VPN: erro 809 no Windows 10"
            excerpt="O erro 809 acontece quando o firewall bloqueia o tráfego L2TP. No Windows 10, ajuste a chave AssumeUDPEncapsulationContextOnSendRule e reinicie."
          />
          <ReplyBubble text="Isso resolveu?" />
        </div>
        <div className={chatClasses.reply}>
          <ReplyHeader author="Nexo Assist" />
          <TypingBubble />
        </div>
      </Section>

      <Section title="Transferência e eventos">
        <HandoffBanner reason="requested" outOfHours transferredAt={Date.UTC(2026, 9, 30, 23, 0)} />
        <HandoffBanner reason="critical" outOfHours transferredAt={Date.UTC(2026, 9, 30, 23, 0)} />
        <HandoffBanner reason="overdue" outOfHours={false} transferredAt={NOW} />
        <HandoffBanner reason="low_confidence" outOfHours={false} transferredAt={NOW} />
        <ConversationEventLine kind="transferred" />
        <ConversationEventLine kind="assigned" actorName="Ana Ribeiro (Suporte N1)" />
        <ConversationEventLine kind="returned_to_agent" />
        <ConversationEventLine kind="draft_cancelled" />
        <ConversationEventLine kind="closed" />
      </Section>

      <Section title="Mensagem do analista">
        <div className={chatClasses.reply}>
          <ReplyHeader author="Ana Ribeiro" badge="Suporte N1" />
          <ReplyBubble
            analyst
            text="Oi, Pedro! Já estou olhando o sistema de estoque com a equipe de infraestrutura."
          />
        </div>
      </Section>

      <Section title="Erro">
        <ErrorBlock
          message="O sistema de chamados não respondeu. Tente de novo em instantes."
          retryable
          onRetry={() => record("onRetry()")}
        />
        <ErrorBlock
          message="Não consegui terminar essa resposta. Mande a mensagem de novo."
          retryable={false}
          onRetry={() => record("onRetry()")}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap="md" align="stretch" component="section">
      <Text size="xs" fw={600} tt="uppercase" c="dimmed" pt="md">
        {title}
      </Text>
      {children}
    </Stack>
  );
}
