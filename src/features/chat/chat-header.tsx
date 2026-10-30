import type { ConversationStatus } from "@/domain/enums";
import { ChevronRightIcon, ICON_SIZE } from "@/shared/icons";
import classes from "./chat.module.css";
import { conversationStatusText, type AnalystInfo } from "./chat-texts";
import { MobileNavigation } from "./mobile-navigation";

/** Tom do selo (cores de status da fundação visual: --nexo-color-status-<tom>-*). */
const STATUS_TONES: Record<ConversationStatus, string> = {
  agent: "success",
  waiting_analyst: "warning",
  with_analyst: "progress",
  closed: "neutral",
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
        <MobileNavigation />
        {/* No celular sobra pouco espaço: fica só a tela atual, ao lado do menu. */}
        <span className={classes.breadcrumbRoot}>
          Service desk de TI
          <ChevronRightIcon size={ICON_SIZE.sm} />
        </span>
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
  const tone = STATUS_TONES[status];
  const text = conversationStatusText(status, analyst);
  const toneVariables = {
    "--status-bg": `var(--nexo-color-status-${tone}-bg)`,
    "--status-text": `var(--nexo-color-status-${tone}-text)`,
    "--status-dot": `var(--nexo-color-status-${tone}-dot)`,
  } as React.CSSProperties;
  return (
    <span
      className={classes.statusBadge}
      style={toneVariables}
      role="status"
      aria-label={`Estado da conversa: ${text}`}
    >
      <span className={classes.statusDot} aria-hidden />
      {text}
    </span>
  );
}
