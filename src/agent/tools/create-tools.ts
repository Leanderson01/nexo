import { createTool } from "@mastra/core/tools";

import { findSimilarTicketsTool } from "./find-similar-tickets";
import { getMyTicketTool } from "./get-my-ticket";
import { listMyTicketsTool } from "./list-my-tickets";
import { offerQuickRepliesTool } from "./offer-quick-replies";
import { proposeReopenTool } from "./propose-reopen";
import { proposeTicketDraftTool } from "./propose-ticket-draft";
import { proposeTicketUpdateTool } from "./propose-ticket-update";
import { requestHandoffTool } from "./request-handoff";
import { searchKnowledgeBaseTool } from "./search-knowledge-base";
import { selectTicketTool } from "./select-ticket";
import { showTicketSelectorTool } from "./show-ticket-selector";
import type { AgentTool, ToolSession, ToolSuccess } from "./tool-session";
import { withTrace, type TraceEnvironment } from "./with-trace";

/**
 * Factory da §5.8: as tools da §6.4 criadas por requisição, com o funcionário e a conversa
 * em closure e cada execução embrulhada em `withTrace`. Não existe tool de criar chamado:
 * as de proposta só gravam o rascunho (§5.5).
 */
export function createTools(session: ToolSession, environment: TraceEnvironment) {
  return {
    searchKnowledgeBase: toMastraTool(searchKnowledgeBaseTool(session), environment),
    listMyTickets: toMastraTool(listMyTicketsTool(session), environment),
    getMyTicket: toMastraTool(getMyTicketTool(session), environment),
    findSimilarTickets: toMastraTool(findSimilarTicketsTool(session), environment),
    proposeTicketDraft: toMastraTool(proposeTicketDraftTool(session), environment),
    proposeTicketUpdate: toMastraTool(proposeTicketUpdateTool(session), environment),
    proposeReopen: toMastraTool(proposeReopenTool(session), environment),
    selectTicket: toMastraTool(selectTicketTool(session), environment),
    requestHandoff: toMastraTool(requestHandoffTool(session), environment),
    offerQuickReplies: toMastraTool(offerQuickRepliesTool(session), environment),
    showTicketSelector: toMastraTool(showTicketSelectorTool(session), environment),
  };
}

function toMastraTool<Input, Output extends ToolSuccess>(
  tool: AgentTool<Input, Output>,
  environment: TraceEnvironment,
) {
  const execute = withTrace(tool, environment);
  return createTool({
    id: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    execute: (input: Input) => execute(input),
  });
}
