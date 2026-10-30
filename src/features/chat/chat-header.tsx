import { Badge } from "@mantine/core";

import type { ConversationStatus } from "@/domain/enums";
import classes from "./chat.module.css";
import { conversationStatusText, type AnalystInfo } from "./chat-texts";
import { ChevronRightIcon } from "./icons";

const STATUS_COLORS: Record<ConversationStatus, string> = {
  agent: "green",
  waiting_analyst: "orange",
  with_analyst: "blue",
  closed: "gray",
};

/** Breadcrumb do protótipo e o selo com o estado da conversa, sempre visível (§7.2). */
export function ChatHeader({
  status,
  analyst,
}: {
  /** null enquanto carrega: o selo só aparece quando o estado é conhecido. */
  status: ConversationStatus | null;
  analyst: AnalystInfo | null;
}) {
  return (
    <PageHeader current="Atendimento">
      {status && <StatusBadge status={status} analyst={analyst} />}
    </PageHeader>
  );
}

/** Cabeçalho das telas do funcionário: breadcrumb "Service desk de TI > <tela>" e o que vier à direita. */
export function PageHeader({ current, children }: { current: string; children?: React.ReactNode }) {
  return (
    <header className={classes.header}>
      <div className={classes.breadcrumb}>
        <span>Service desk de TI</span>
        <ChevronRightIcon size={12} />
        <span className={classes.breadcrumbCurrent}>{current}</span>
      </div>
      {children}
    </header>
  );
}

function StatusBadge({
  status,
  analyst,
}: {
  status: ConversationStatus;
  analyst: AnalystInfo | null;
}) {
  const color = STATUS_COLORS[status];
  const text = conversationStatusText(status, analyst);
  return (
    <Badge
      variant="light"
      color={color}
      radius="xl"
      tt="none"
      fw={500}
      leftSection={<StatusDot color={color} />}
      aria-label={`Estado da conversa: ${text}`}
    >
      {text}
    </Badge>
  );
}

function StatusDot({ color }: { color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: `var(--mantine-color-${color}-6)`,
      }}
    />
  );
}
