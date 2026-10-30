"use client";

import { useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { CheckIcon } from "../icons";
import classes from "./blocks.module.css";

// Linha acima de cada resposta: quem escreveu e, para o agent, os chips do que ele fez
// ("✓ consultou seus chamados") com o link "Ver detalhes" do painel de decisão (decisão 13).

export function ReplyHeader({
  author,
  badge,
  children,
}: {
  author: string;
  /** Nível do analista ("Suporte N1"), em verde como no console. */
  badge?: string | null;
  /** Chips de ação. */
  children?: React.ReactNode;
}) {
  return (
    <div className={classes.replyHeader}>
      <span className={classes.replyAuthor}>{author}</span>
      {badge && <span className={classes.levelBadge}>{badge}</span>}
      {children}
    </div>
  );
}

/** Os chips em si. Sem `onShowDetails`, o link "Ver detalhes" não aparece. */
export function ActionChips({
  labels,
  onShowDetails,
}: {
  labels: string[];
  onShowDetails?: () => void;
}) {
  return (
    <>
      {labels.map((label, index) => (
        <span key={index} className={classes.chip}>
          <CheckIcon size={12} />
          {label}
        </span>
      ))}
      {onShowDetails && (
        <button type="button" className={classes.detailsLink} onClick={onShowDetails}>
          Ver detalhes
        </button>
      )}
    </>
  );
}

/** Chips de uma mensagem do agent, lidos do registro de decisão dela. */
export function LiveActionChips({
  messageId,
  decisionId,
  onShowDetails,
}: {
  messageId: string;
  decisionId: string;
  /** Abre o painel de decisão (T8). */
  onShowDetails?: (decisionId: string) => void;
}) {
  const labels = useQuery(api.decisions.getActionLabels, { messageId });
  return (
    <ActionChips
      labels={labels ?? []}
      onShowDetails={onShowDetails ? () => onShowDetails(decisionId) : undefined}
    />
  );
}
