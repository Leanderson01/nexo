"use client";

import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Skeleton,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";

import { CONFIDENCE_LEVEL_LABELS, HANDOFF_REASON_LABELS } from "@/domain/labels";
import { ConversationBlockReads } from "@/features/chat/blocks/block-reads";
import { findChosenText } from "@/features/chat/blocks/reply-segments";
import { DotLabel } from "@/features/chat/blocks/dot-label";
import { useNow } from "@/features/chat/blocks/use-now";
import { HeadsetIcon } from "@/features/chat/icons";
import {
  DecisionPanelDrawer,
  useDecisionPanel,
} from "@/features/decision-panel/decision-panel-drawer";
import { api } from "../../../convex/_generated/api";
import classes from "./console.module.css";
import { ConsoleMessageItem, type ConsoleMessage } from "./console-message";
import {
  HANDOFF_REASON_COLORS,
  confidenceText,
  conversationBadge,
  elapsedText,
  firstName,
} from "./console-texts";
import { EmployeePanel } from "./employee-panel";
import { HandIcon, PauseIcon, ReturnIcon, SendIcon, StopIcon, TicketIcon } from "./icons";
import { useConsoleActions } from "./use-console-actions";

type ConsoleConversationData = NonNullable<FunctionReturnType<typeof api.console.getConversation>>;

/**
 * A conversa aberta no console (protótipos 05 e 06): cabeçalho, card de resumo fixo,
 * histórico com o painel de decisão, a barra de ações do estado atual e o painel do
 * funcionário. Tudo em tempo real.
 */
export function ConsoleConversation({ conversationId }: { conversationId: string }) {
  const conversation = useQuery(api.console.getConversation, { conversationId });
  const messages = useQuery(api.console.listMessages, { conversationId });
  const [panelOpen, setPanelOpen] = useState(true);
  const decisionPanel = useDecisionPanel();
  const scrollerRef = useRef<HTMLDivElement>(null);
  useScrollToBottom(scrollerRef, messages);
  useMarkRead(conversationId, conversation, messages);

  if (conversation === null || messages === null) return <ConversationNotFound />;
  if (conversation === undefined || messages === undefined) return <ConversationLoading />;

  return (
    <ConversationBlockReads conversationId={conversationId}>
      <section
        className={classes.conversation}
        aria-label={`Conversa com ${conversation.employee.name}`}
      >
        <ConversationHeader
          conversation={conversation}
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelOpen((open) => !open)}
        />

        <div className={classes.scroller} ref={scrollerRef}>
          <div className={classes.column}>
            {conversation.handoff && <TransferSummary conversation={conversation} />}
            {messages.map((message: ConsoleMessage, index) => (
              <ConsoleMessageItem
                key={message._id}
                message={message}
                chosenText={findChosenText(messages, index)}
                onShowDetails={decisionPanel.open}
              />
            ))}
          </div>
        </div>

        <ConversationFooter conversation={conversation} />
      </section>

      {panelOpen && (
        <EmployeePanel
          employee={conversation.employee}
          conversation={{
            status: conversation.status,
            relatedTicketCode: conversation.relatedTicketCode,
            handoffAt: conversation.handoff?.at ?? null,
            assignedAnalystName: conversation.assignedAnalyst?.name ?? null,
          }}
          onClose={() => setPanelOpen(false)}
        />
      )}

      <DecisionPanelDrawer decisionId={decisionPanel.decisionId} onClose={decisionPanel.close} />
    </ConversationBlockReads>
  );
}

// ---------- Cabeçalho ----------

function ConversationHeader({
  conversation,
  panelOpen,
  onTogglePanel,
}: {
  conversation: ConsoleConversationData;
  panelOpen: boolean;
  onTogglePanel: () => void;
}) {
  const { employee, status, relatedTicketCode, isMine } = conversation;
  const badge = conversationBadge(status, conversation.assignedAnalyst?.name ?? null, isMine);
  const subtitle = [employee.department, relatedTicketCode].filter(Boolean).join(" · ");
  const actions = useConsoleActions(conversation._id);
  const [dialog, setDialog] = useState<"return" | "close" | null>(null);
  const isAttending = status === "with_analyst" && isMine;
  // Com o agent ou aguardando, qualquer analista pode encerrar (pelo menu); atendendo, pelo botão.
  const canCloseFromMenu = status === "agent" || status === "waiting_analyst";

  function closeDialog() {
    actions.dismissError();
    setDialog(null);
  }

  return (
    <header className={classes.header}>
      <Avatar name={employee.name} color="initials" radius="xl" size={36} />
      <div>
        <div className={classes.headerName}>{employee.name}</div>
        <div className={classes.headerSub}>{subtitle}</div>
      </div>
      <div className={classes.headerActions}>
        {isAttending ? (
          // Devolver e Encerrar, no cabeçalho, enquanto o analista atende (protótipo 06).
          <>
            <Button
              variant="default"
              size="xs"
              leftSection={<ReturnIcon size={14} />}
              onClick={() => setDialog("return")}
            >
              Devolver ao agent
            </Button>
            <Button
              variant="light"
              color="red"
              size="xs"
              leftSection={<StopIcon size={14} />}
              onClick={() => setDialog("close")}
            >
              Encerrar atendimento
            </Button>
          </>
        ) : (
          <Badge color={badge.color} variant="light" radius="sm" tt="none" size="lg" fw={500}>
            {badge.label}
          </Badge>
        )}
        <Menu position="bottom-end" withArrow>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" aria-label="Mais ações">
              <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
                ⋮
              </span>
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<TicketIcon size={14} />} onClick={onTogglePanel}>
              {panelOpen ? "Esconder chamados" : "Mostrar chamados"}
            </Menu.Item>
            {canCloseFromMenu && (
              <Menu.Item
                color="red"
                leftSection={<StopIcon size={14} />}
                onClick={() => setDialog("close")}
              >
                Encerrar conversa
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </div>

      <ReturnToAgentModal
        opened={dialog === "return"}
        employeeName={employee.name}
        loading={actions.running === "return"}
        error={actions.error}
        onCancel={closeDialog}
        onConfirm={async (note) => {
          if (await actions.returnToAgent(note)) setDialog(null);
        }}
      />
      <CloseConversationModal
        opened={dialog === "close"}
        employeeName={employee.name}
        loading={actions.running === "close"}
        error={actions.error}
        onCancel={closeDialog}
        onConfirm={async () => {
          if (await actions.close()) setDialog(null);
        }}
      />
    </header>
  );
}

// ---------- Card de resumo da transferência (decisão 13) ----------

function TransferSummary({ conversation }: { conversation: ConsoleConversationData }) {
  const [expanded, setExpanded] = useState(true);
  const { handoff, summary } = conversation;
  if (!handoff) return null;

  const tried = [
    ...summary.articleTitles.map((title) => `Artigo "${title}"`),
    summary.clarifyingQuestions > 0
      ? `${summary.clarifyingQuestions} pergunta(s) de esclarecimento`
      : null,
  ].filter((item): item is string => item !== null);
  const confidence = summary.agentConfidence;

  return (
    <section className={classes.summary} aria-label="Resumo da transferência">
      <div className={classes.summaryTitle}>
        Resumo da transferência
        <DotLabel color={HANDOFF_REASON_COLORS[handoff.reason]} colorText>
          {HANDOFF_REASON_LABELS[handoff.reason]}
        </DotLabel>
        <button
          type="button"
          className={classes.summaryToggle}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Recolher" : "Expandir"}
        </button>
      </div>
      {expanded && (
        <>
          <p className={classes.summaryText}>{handoff.summary}</p>
          <div className={classes.summaryGrid}>
            <SummaryField label="Já tentado">
              {tried.length > 0 ? tried.join(" · ") : "Nada além da conversa"}
            </SummaryField>
            <SummaryField label="Chamados envolvidos">
              {summary.ticketCodes.length > 0 ? summary.ticketCodes.join(", ") : "Nenhum"}
            </SummaryField>
            <SummaryField label="Confiança do agent">
              {confidence
                ? confidenceText(confidence.value, CONFIDENCE_LEVEL_LABELS[confidence.level])
                : "Não registrada"}
            </SummaryField>
          </div>
        </>
      )}
    </section>
  );
}

function SummaryField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={classes.summaryLabel}>{label}</div>
      <div className={classes.summaryValue}>{children}</div>
    </div>
  );
}

// ---------- Rodapé: a ação de cada estado ----------

function ConversationFooter({ conversation }: { conversation: ConsoleConversationData }) {
  const { status, isMine, employee } = conversation;

  if (status === "waiting_analyst") return <WaitingFooter conversation={conversation} />;
  if (status === "with_analyst" && isMine) {
    return <AnalystComposer conversationId={conversation._id} employeeName={employee.name} />;
  }

  const note =
    status === "with_analyst"
      ? `Em atendimento por ${conversation.assignedAnalyst?.name ?? "outro analista"}. Você acompanha em modo leitura.`
      : status === "agent"
        ? "O Nexo Assist está atendendo. Você acompanha em tempo real."
        : "Conversa encerrada. O funcionário pode iniciar uma nova conversa.";
  return (
    <footer className={classes.footer}>
      <Text size="sm" c="dimmed" ta="center">
        {note}
      </Text>
    </footer>
  );
}

/** "Pedro espera um atendente" com Devolver ao agent e Assumir atendimento (protótipo 05). */
function WaitingFooter({ conversation }: { conversation: ConsoleConversationData }) {
  const actions = useConsoleActions(conversation._id);
  const [returning, setReturning] = useState(false);
  const now = useNow(30_000);
  const name = conversation.employee.name;
  const waitingSince = conversation.handoff?.at ?? null;

  return (
    <footer className={classes.footer}>
      {actions.error && !returning && (
        <Alert color="red" variant="light" mb="sm" withCloseButton onClose={actions.dismissError}>
          {actions.error}
        </Alert>
      )}
      <div className={classes.waitingBar}>
        <span className={classes.waitingIcon}>
          <HandIcon size={16} />
        </span>
        <div>
          <div className={classes.waitingTitle}>{firstName(name)} espera um atendente</div>
          <div className={classes.waitingSub}>
            Agent pausado
            {waitingSince !== null && ` · aguardando há ${elapsedText(waitingSince, now)}`}
          </div>
        </div>
        <div className={classes.footerActions}>
          <Button
            variant="default"
            leftSection={<ReturnIcon size={14} />}
            onClick={() => setReturning(true)}
          >
            Devolver ao agent
          </Button>
          <Button
            leftSection={<HeadsetIcon size={14} />}
            loading={actions.running === "assign"}
            onClick={() => void actions.assign()}
          >
            Assumir atendimento
          </Button>
        </div>
      </div>
      <Textarea
        disabled
        placeholder="Assuma o atendimento para responder"
        aria-label="Mensagem para o funcionário"
        autosize
        minRows={1}
      />
      <ReturnToAgentModal
        opened={returning}
        employeeName={name}
        loading={actions.running === "return"}
        error={actions.error}
        onCancel={() => {
          actions.dismissError();
          setReturning(false);
        }}
        onConfirm={async (note) => {
          if (await actions.returnToAgent(note)) setReturning(false);
        }}
      />
    </footer>
  );
}

/** Campo do analista, habilitado só para quem assumiu. Enter envia; Shift+Enter quebra linha. */
function AnalystComposer({
  conversationId,
  employeeName,
}: {
  conversationId: string;
  employeeName: string;
}) {
  const actions = useConsoleActions(conversationId);
  const [text, setText] = useState("");

  async function send() {
    const toSend = text.trim();
    if (toSend === "" || actions.running === "send") return;
    setText("");
    const sent = await actions.send(toSend);
    if (!sent) setText(toSend);
  }

  return (
    <footer className={classes.footer}>
      {actions.error && (
        <Alert color="red" variant="light" mb="sm" withCloseButton onClose={actions.dismissError}>
          {actions.error}
        </Alert>
      )}
      <div className={classes.pausedNote}>
        <PauseIcon size={12} /> Agent pausado enquanto você atende
      </div>
      <div className={classes.composer}>
        <Textarea
          style={{ flex: 1 }}
          autosize
          minRows={1}
          maxRows={6}
          placeholder={`Responder para ${firstName(employeeName)}`}
          aria-label={`Mensagem para ${employeeName}`}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <ActionIcon
          size={38}
          radius="xl"
          aria-label="Enviar mensagem"
          loading={actions.running === "send"}
          disabled={text.trim() === ""}
          onClick={() => void send()}
        >
          <SendIcon size={16} />
        </ActionIcon>
      </div>
    </footer>
  );
}

// ---------- Diálogos ----------

function ReturnToAgentModal({
  opened,
  employeeName,
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  opened: boolean;
  employeeName: string;
  loading: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");

  return (
    <Modal opened={opened} onClose={onCancel} title="Devolver ao agent" centered>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          O Nexo Assist volta a atender {firstName(employeeName)} e lê a nota e as suas mensagens no
          próximo turno.
        </Text>
        <Textarea
          label="Nota para o agent (opcional)"
          placeholder="Ex.: já resetei a VPN, confirme se voltou"
          autosize
          minRows={2}
          maxRows={6}
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          data-autofocus
        />
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onCancel}>
            Cancelar
          </Button>
          <Button loading={loading} onClick={() => onConfirm(note)}>
            Devolver
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function CloseConversationModal({
  opened,
  employeeName,
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  opened: boolean;
  employeeName: string;
  loading: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal opened={opened} onClose={onCancel} title="Encerrar atendimento?" centered>
      <Stack gap="sm">
        <Text size="sm">
          A conversa com {firstName(employeeName)} será encerrada. Ele vê o aviso e pode iniciar uma
          nova conversa.
        </Text>
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onCancel}>
            Cancelar
          </Button>
          <Button color="red" loading={loading} onClick={onConfirm}>
            Encerrar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ---------- Efeitos ----------

/** Rola até o fim quando chegam mensagens, a menos que o analista tenha subido para ler. */
function useScrollToBottom(ref: RefObject<HTMLDivElement | null>, content: unknown) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceFromBottom < 240) element.scrollTop = element.scrollHeight;
  }, [ref, content]);
}

/** Com a conversa aberta, mensagens novas do funcionário contam como lidas (decisão 12). */
function useMarkRead(
  conversationId: string,
  conversation: ConsoleConversationData | null | undefined,
  messages: ConsoleMessage[] | null | undefined,
) {
  const markRead = useMutation(api.console.markRead);
  const lastEmployeeMessageAt =
    messages?.findLast((message) => message.role === "user")?.createdAt ?? 0;
  const readAt = conversation?.analystReadAt ?? 0;
  const canAttend =
    conversation?.status === "waiting_analyst" ||
    (conversation?.status === "with_analyst" && conversation.isMine);

  useEffect(() => {
    if (canAttend && lastEmployeeMessageAt > readAt) void markRead({ conversationId });
  }, [canAttend, conversationId, lastEmployeeMessageAt, markRead, readAt]);
}

// ---------- Carregando e não encontrada ----------

function ConversationLoading() {
  return (
    <section className={classes.conversation} aria-label="Carregando a conversa">
      <header className={classes.header}>
        <Skeleton circle height={36} />
        <Stack gap={6}>
          <Skeleton height={12} width={140} />
          <Skeleton height={10} width={100} />
        </Stack>
      </header>
      <div className={classes.column}>
        <Skeleton height={90} radius="md" />
        <Skeleton height={40} width="50%" radius="md" />
        <Skeleton height={60} width="60%" ml="auto" radius="md" />
      </div>
    </section>
  );
}

function ConversationNotFound() {
  return (
    <div className={classes.emptyMain}>
      <Stack align="center" gap="sm">
        <Text fw={600}>Não encontramos essa conversa.</Text>
        <Button component={Link} href="/console" variant="default" size="xs">
          Voltar à fila
        </Button>
      </Stack>
    </div>
  );
}
