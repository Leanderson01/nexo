import type { Intent } from "@/domain/enums";
import type { TicketCode } from "@/domain/ticket";
import type { Understanding } from "@/domain/understanding";

import { resolveFocusedTicket, type FocusedTicketResolution } from "./resolve-focused-ticket";
import type { TurnWorkspace } from "./turn-workspace";

// Entre ENTENDER e DECIDIR (decisão 2): quando o turno fala de chamado, consulta os chamados
// do funcionário (pela tool `listMyTickets`, então a consulta aparece no painel) e resolve o
// chamado em foco em código, para a OverdueTicketPolicy saber de qual chamado se trata.

/** Intenções que nunca dependem de chamado: o turno não consulta o legado. */
const INTENTS_WITHOUT_TICKETS: readonly Intent[] = [
  "out_of_scope",
  "talk_to_analyst",
  "greeting_or_smalltalk",
];
/** Intenções que sempre falam de um chamado existente. */
const TICKET_INTENTS: readonly Intent[] = ["ticket_status", "update_ticket"];

export function needsEmployeeTickets(
  understanding: Understanding,
  selectedTicketCode: TicketCode | null,
): boolean {
  if (INTENTS_WITHOUT_TICKETS.includes(understanding.intent)) return false;
  return (
    TICKET_INTENTS.includes(understanding.intent) ||
    understanding.entities.ticketRef !== null ||
    selectedTicketCode !== null
  );
}

export interface FocusResult {
  resolution: FocusedTicketResolution;
  /** O serviço de chamados não respondeu depois das tentativas. */
  ticketsUnavailable: boolean;
}

const NO_FOCUS: FocusedTicketResolution = { focusedTicket: null, ambiguousCandidates: [] };

export async function resolveFocus(options: {
  understanding: Understanding;
  selectedTicketCode: TicketCode | null;
  workspace: TurnWorkspace;
  /** A tool `listMyTickets` já embrulhada no `withTrace`; preenche `workspace.employeeTickets`. */
  listEmployeeTickets: () => Promise<unknown>;
}): Promise<FocusResult> {
  const { understanding, selectedTicketCode, workspace } = options;
  if (!needsEmployeeTickets(understanding, selectedTicketCode)) {
    return { resolution: NO_FOCUS, ticketsUnavailable: false };
  }

  await options.listEmployeeTickets();
  if (!workspace.employeeTickets) {
    return { resolution: NO_FOCUS, ticketsUnavailable: workspace.legacyUnavailable };
  }

  const resolution = resolveFocusedTicket({
    ticketRef: understanding.entities.ticketRef,
    selectedTicketCode,
    employeeTickets: workspace.employeeTickets,
  });
  workspace.focusedTicket = resolution.focusedTicket;
  return { resolution, ticketsUnavailable: false };
}
