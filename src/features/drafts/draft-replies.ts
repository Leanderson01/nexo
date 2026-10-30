import type { PendingActionKind } from "@/domain/enums";
import { PRIORITY_DEADLINES } from "@/domain/priority";
import { computeDueAt } from "@/domain/sla";
import type { Ticket } from "@/domain/ticket";
import type { GatewayError } from "@/agent/gateways/gateway-error";
import { formatDateTime, formatShortDate, formatTime } from "@/features/chat/blocks/block-texts";

// O que o assistente diz depois de confirmar o rascunho (§6.5): sem LLM, só texto montado
// em código a partir do chamado que o serviço devolveu.

/**
 * Texto que acompanha o card do chamado, com o prazo da primeira resposta calculado pelo
 * domínio (§3.6): "Pronto, abri o INC-20431. A primeira resposta vem até hoje, 13:43
 * (4 horas úteis)."
 */
export function confirmationReplyText(
  kind: PendingActionKind,
  ticket: Pick<Ticket, "code" | "priority" | "lastActivityAt">,
  options: { now: number; criticalHandoff: boolean },
): string {
  const deadline = PRIORITY_DEADLINES[ticket.priority].label;
  const when = whenText(computeDueAt(ticket.priority, ticket.lastActivityAt), options.now);
  const sentences = [
    `${whatWasDone(kind, ticket.code)} A primeira resposta do suporte vem até ${when} (${deadline}).`,
  ];
  if (options.criticalHandoff) {
    sentences.push("Por ser um caso crítico, um analista do plantão vai assumir esta conversa.");
  }
  return sentences.join(" ");
}

function whatWasDone(kind: PendingActionKind, code: string): string {
  switch (kind) {
    case "create_ticket":
      return `Pronto, abri o ${code}.`;
    case "update_ticket":
      return `Pronto, registrei a informação no ${code}.`;
    case "reopen_ticket":
      return `Pronto, reabri o ${code}.`;
  }
}

/** "hoje, 13:43" no mesmo dia; senão "31 out, 09:00". */
function whenText(dueAt: number, now: number): string {
  const sameDay = formatShortDate(dueAt) === formatShortDate(now) && dueAt - now < DAY_MS;
  return sameDay ? `hoje, ${formatTime(dueAt)}` : formatDateTime(dueAt);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Mensagem honesta quando o serviço não gravou (§5.6, §8 "legado instável"). Instabilidade
 * dá "Tentar de novo"; recusa (chamado fechado, prazo de reabertura vencido) não, porque
 * repetir daria o mesmo resultado.
 */
export function confirmationFailureReply(error: GatewayError): {
  message: string;
  retryable: boolean;
} {
  if (error.kind === "unavailable") {
    return {
      message:
        "O sistema de chamados está instável no momento e não consegui registrar o seu pedido. " +
        "O rascunho continua aqui: tente de novo em instantes ou peça para falar com um analista.",
      retryable: true,
    };
  }
  return {
    message: `O sistema de chamados não aceitou o pedido: ${error.message.replace(/\.?$/, ".")} Você pode editar ou cancelar o rascunho.`,
    retryable: false,
  };
}
