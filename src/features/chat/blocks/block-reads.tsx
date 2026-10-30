"use client";

import { useQuery } from "convex/react";
import { createContext, useContext } from "react";

import { useSignedInQuery } from "@/features/auth/use-signed-in-query";
import { api } from "../../../../convex/_generated/api";

// De onde os blocos leem os dados (card de chamado, seletor, rascunho e chips).
// No chat, o padrão: as leituras do funcionário logado ("os meus chamados").
// No console, `ConversationBlockReads` troca para as leituras escopadas pela conversa
// (`convex/conversationBlocks.ts`), que o analista pode usar e que só devolvem chamados
// do funcionário daquela conversa.

type BlockReadScope = { kind: "employee" } | { kind: "conversation"; conversationId: string };

const BlockReadScopeContext = createContext<BlockReadScope>({ kind: "employee" });

/** Os blocos dentro deste provider leem pela conversa (console do analista). */
export function ConversationBlockReads({
  conversationId,
  children,
}: {
  conversationId: string;
  children: React.ReactNode;
}) {
  return (
    <BlockReadScopeContext.Provider value={{ kind: "conversation", conversationId }}>
      {children}
    </BlockReadScopeContext.Provider>
  );
}

/** As duas queries ficam declaradas (regra dos hooks); a que não vale para o escopo é pulada. */
function useScope() {
  const scope = useContext(BlockReadScopeContext);
  const conversationId = scope.kind === "conversation" ? scope.conversationId : null;
  return { isEmployee: scope.kind === "employee", conversationId };
}

/** O chamado do card; undefined carregando, null se não existe ou não pode ser lido. */
export function useBlockTicket(code: string) {
  const { isEmployee, conversationId } = useScope();
  const mine = useSignedInQuery(api.ticketing.queries.getMine, isEmployee ? { code } : "skip");
  const scoped = useQuery(
    api.conversationBlocks.ticket,
    conversationId ? { conversationId, code } : "skip",
  );
  return isEmployee ? mine : scoped;
}

/** Os chamados do seletor; undefined carregando. */
export function useBlockTickets() {
  const { isEmployee, conversationId } = useScope();
  const mine = useSignedInQuery(api.ticketing.queries.listMine, isEmployee ? {} : "skip");
  const scoped = useQuery(
    api.conversationBlocks.tickets,
    conversationId ? { conversationId } : "skip",
  );
  if (isEmployee) return mine;
  return scoped === null ? [] : scoped;
}

/** O rascunho do card; undefined carregando, null se não existe ou não pode ser lido. */
export function useBlockPendingAction(pendingActionId: string) {
  const { isEmployee } = useScope();
  const mine = useSignedInQuery(api.pendingActions.get, isEmployee ? { pendingActionId } : "skip");
  const scoped = useQuery(
    api.conversationBlocks.pendingAction,
    isEmployee ? "skip" : { pendingActionId },
  );
  return isEmployee ? mine : scoped;
}

/** Rótulos dos chips de uma resposta do agent. */
export function useBlockActionLabels(messageId: string) {
  const { isEmployee } = useScope();
  const mine = useSignedInQuery(api.decisions.getActionLabels, isEmployee ? { messageId } : "skip");
  const scoped = useQuery(api.conversationBlocks.actionLabels, isEmployee ? "skip" : { messageId });
  return isEmployee ? mine : scoped;
}
