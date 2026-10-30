import type { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";

import type { Handoff } from "@/domain/conversation";
import type { DecisionRecord } from "@/domain/decision-record";
import type { PendingAction } from "@/domain/pending-action";
import type { Result } from "@/domain/result";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AgentTransferError } from "../../../convex/agent";

// Porta do pipeline para o estado da conversa no Convex (convex/agent.ts). O turno real usa
// o adapter com o segredo do servidor; os testes usam uma implementação em memória.

/** O contexto do turno como o Convex devolve (`loadTurnContext`). */
export type TurnSnapshot = NonNullable<FunctionReturnType<typeof api.agent.loadTurnContext>>;
export type HistoryMessage = TurnSnapshot["recentMessages"][number];
export type PendingDraftSnapshot = NonNullable<TurnSnapshot["pendingDraft"]>;

/** Campos de `saveTurnState`: ausente = não muda; `null` = limpa. */
export type TurnStatePatch = Omit<
  FunctionArgs<typeof api.agent.saveTurnState>,
  "secret" | "conversationId"
>;

export interface CreatedDraft {
  pendingActionId: string;
  draftNumber: number;
}

export interface AgentStore {
  loadTurnContext(): Promise<TurnSnapshot | null>;
  createDraft(action: PendingAction, handoffOnConfirm: boolean): Promise<CreatedDraft>;
  saveTurnState(patch: TurnStatePatch): Promise<void>;
  recordDecision(record: DecisionRecord): Promise<Id<"decisions">>;
  transfer(handoff: Omit<Handoff, "at">): Promise<Result<null, AgentTransferError>>;
}

export function createConvexAgentStore(options: {
  convex: ConvexHttpClient;
  agentSecret: string;
  conversationId: Id<"conversations">;
  assistantMessageId: Id<"messages">;
}): AgentStore {
  const { convex, agentSecret: secret, conversationId, assistantMessageId } = options;
  return {
    loadTurnContext: () =>
      convex.query(api.agent.loadTurnContext, { secret, conversationId, assistantMessageId }),
    createDraft: (action, handoffOnConfirm) =>
      convex.mutation(api.agent.createDraft, { secret, conversationId, action, handoffOnConfirm }),
    saveTurnState: async (patch) => {
      await convex.mutation(api.agent.saveTurnState, { secret, conversationId, ...patch });
    },
    recordDecision: (record) =>
      convex.mutation(api.agent.recordDecision, {
        secret,
        conversationId,
        messageId: assistantMessageId,
        record,
      }),
    transfer: (handoff) =>
      convex.mutation(api.agent.transfer, { secret, conversationId, ...handoff }),
  };
}
