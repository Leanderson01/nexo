import type { Intent } from "@/domain/enums";
import type { TicketCode } from "@/domain/ticket";
import type { Understanding } from "@/domain/understanding";
import { normalizeText } from "@/shared/normalize-text";

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

/**
 * O que identifica o chamado: o `ticketRef` do ENTENDER ou, numa consulta de chamado sem ele
 * (medido: "e o meu chamado do notebook?" às vezes sai sem `ticketRef`), o dispositivo, o
 * sistema e, por fim, a própria mensagem, cujas palavras são comparadas com os títulos. Com
 * chamado já em foco, a mensagem não entra, para "e aí, alguma novidade?" seguir nele.
 */
export function ticketReference(
  understanding: Understanding,
  userText: string,
  selectedTicketCode: TicketCode | null,
): string | null {
  const { ticketRef, device, system } = understanding.entities;
  if (ticketRef) return ticketRef;
  if (!TICKET_INTENTS.includes(understanding.intent)) return null;
  return device ?? system ?? (selectedTicketCode ? null : userText);
}

export interface FocusResult {
  resolution: FocusedTicketResolution;
  /** O serviço de chamados não respondeu depois das tentativas. */
  ticketsUnavailable: boolean;
}

const NO_FOCUS: FocusedTicketResolution = { focusedTicket: null, ambiguousCandidates: [] };

export async function resolveFocus(options: {
  understanding: Understanding;
  userText: string;
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
    ticketRef: ticketReference(understanding, options.userText, selectedTicketCode),
    selectedTicketCode,
    employeeTickets: workspace.employeeTickets,
  });
  workspace.focusedTicket = resolution.focusedTicket;
  const unspecified = unspecifiedTicket(
    understanding,
    options.userText,
    selectedTicketCode,
    resolution,
  );
  if (unspecified && workspace.employeeTickets.length > 1) {
    return {
      resolution: { focusedTicket: null, ambiguousCandidates: workspace.employeeTickets },
      ticketsUnavailable: false,
    };
  }
  return { resolution, ticketsUnavailable: false };
}

/** "Qual o status do meu chamado?": um chamado, no singular, sem dizer qual. */
const ONE_UNNAMED_TICKET = /\b(meu|o|do|esse|este) (chamado|pedido|ticket)\s*[?.!]*\s*$/;

/**
 * Consulta de um chamado sem dizer qual, com mais de um: o seletor (F2, "vários"), decidido em
 * código (QA: o modelo às vezes listava os chamados no texto, ou dizia "não encontrei").
 */
function unspecifiedTicket(
  understanding: Understanding,
  userText: string,
  selectedTicketCode: TicketCode | null,
  resolution: FocusedTicketResolution,
): boolean {
  if (understanding.intent !== "ticket_status" || selectedTicketCode !== null) return false;
  if (resolution.focusedTicket !== null || resolution.ambiguousCandidates.length > 0) return false;
  const { ticketRef, device, system } = understanding.entities;
  if (ticketRef || device || system) return false;
  return ONE_UNNAMED_TICKET.test(normalizeText(userText));
}
