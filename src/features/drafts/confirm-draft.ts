import type { GatewayError } from "@/agent/gateways/gateway-error";
import type { TicketGateway } from "@/agent/gateways/ticket-gateway";
import type { PendingAction } from "@/domain/pending-action";
import { err, ok, type Result } from "@/domain/result";
import type { TicketDetail } from "@/domain/ticket";
import { api } from "../../../convex/_generated/api";
import type { ConvexCaller } from "./convex-caller";
import type { DraftApiErrorCode } from "./draft-api-errors";
import { confirmationFailureReply, confirmationReplyText } from "./draft-replies";

// "Confirmar" do rascunho (§6.5 item 2), sem passar pelo LLM:
//   1. carrega o rascunho como o funcionário (só o dono enxerga);
//   2. executa no serviço de chamados com a chave de idempotência = id do rascunho, então
//      clique duplo e "Tentar de novo" devolvem o mesmo chamado em vez de criar outro;
//   3. grava o card do chamado com o prazo e, no caso crítico, transfere (com o segredo);
//      se o legado não respondeu, grava a mensagem honesta e o rascunho fica pendente.

export interface ConfirmDraftInput {
  convex: ConvexCaller;
  agentSecret: string;
  /** Cria o gateway já vinculado ao funcionário dono do rascunho. */
  createGateway: (employeeId: string) => TicketGateway;
  conversationId: string;
  pendingActionId: string;
  now?: () => number;
}

export interface ConfirmedDraft {
  ticketCode: string;
  /** Verdadeiro quando outro clique já tinha confirmado: nada novo foi gravado. */
  alreadyConfirmed: boolean;
  /** A política Crítica transferiu a conversa para um analista. */
  transferred: boolean;
}

export async function confirmDraft(
  input: ConfirmDraftInput,
): Promise<Result<ConfirmedDraft, DraftApiErrorCode>> {
  const { convex, agentSecret, conversationId, pendingActionId } = input;
  const now = input.now ?? Date.now;

  const loaded = await convex.query(api.pendingActions.loadForEmployee, {
    conversationId,
    pendingActionId,
  });
  if (!loaded.ok) return loaded;
  const draft = loaded.value;

  if (draft.status === "confirmed" && draft.resultTicketCode) {
    return ok({ ticketCode: draft.resultTicketCode, alreadyConfirmed: true, transferred: false });
  }
  if (draft.status !== "pending") return err("not_pending");
  if (draft.conversationStatus === "closed") return err("closed");
  if (draft.agentBusy) return err("busy");

  const gateway = input.createGateway(draft.employeeId);
  const executed = await executePendingAction(gateway, draft.action, draft.pendingActionId);
  const serverArgs = {
    secret: agentSecret,
    employeeId: draft.employeeId,
    conversationId: draft.conversationId,
    pendingActionId: draft.pendingActionId,
  };

  if (!executed.ok) {
    const failed = await convex.mutation(api.pendingActions.recordConfirmFailure, {
      ...serverArgs,
      ...confirmationFailureReply(executed.error),
    });
    if (!failed.ok) return failed;
    return err(
      executed.error.kind === "unavailable" ? "ticketing_unavailable" : "ticketing_rejected",
    );
  }

  const ticket = executed.value;
  const completed = await convex.mutation(api.pendingActions.completeConfirm, {
    ...serverArgs,
    ticketCode: ticket.code,
    replyText: confirmationReplyText(draft.action.kind, ticket, {
      now: now(),
      criticalHandoff: draft.handoffOnConfirm,
    }),
  });
  if (!completed.ok) return completed;

  if (completed.value.transferred) {
    // O chamado vai para "Aguardando analista". Se falhar, a conversa já está transferida;
    // o analista vê o chamado do mesmo jeito, então só registramos.
    const marked = await gateway.markHandoff(ticket.code, draft.conversationId);
    if (!marked.ok) console.error("[confirm] markHandoff falhou", marked.error);
  }

  return ok({ ticketCode: ticket.code, ...completed.value });
}

/** A escrita no serviço de chamados que o rascunho descreve. */
export function executePendingAction(
  gateway: TicketGateway,
  action: PendingAction,
  idempotencyKey: string,
): Promise<Result<TicketDetail, GatewayError>> {
  switch (action.kind) {
    case "create_ticket":
      return gateway.create(action.ticket, idempotencyKey);
    case "update_ticket":
      return gateway.addUpdate(
        action.code,
        { text: action.text, fieldChanges: action.fieldChanges },
        idempotencyKey,
      );
    case "reopen_ticket":
      return gateway.reopen(action.code, action.reason, idempotencyKey);
  }
}
