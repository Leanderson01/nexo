import type { TicketCode, TicketSummary } from "@/domain/ticket";
import { normalizeText, splitWords } from "@/shared/normalize-text";

// Chamado em foco, resolvido em código entre ENTENDER e DECIDIR (TASKS.md, decisão 2), para a
// OverdueTicketPolicy saber de qual chamado se fala antes do AGIR.
//
// Regras, nesta ordem:
// 1. `ticketRef` com código ("INC-20311", "inc 20311"): casa exato entre os chamados do
//    funcionário. Código que não é dele dá `null`, igual a inexistente (privacidade, §3.4).
// 2. `ticketRef` com descrição ("o do notebook"): casa pelas palavras do título, sem acento e sem
//    palavras vazias. Vencem os chamados com mais palavras em comum; empate = ambiguidade.
// 3. Sem `ticketRef`, ou com uma referência sem palavras úteis ("esse aí"): o `selectedTicketCode`
//    da conversa, se ainda estiver entre os chamados do funcionário.

export interface FocusedTicketInput {
  ticketRef: string | null;
  selectedTicketCode: TicketCode | null;
  /** Só os chamados do funcionário logado. */
  employeeTickets: TicketSummary[];
}

export interface FocusedTicketResolution {
  /** `null` quando não há chamado em foco ou quando há ambiguidade. */
  focusedTicket: TicketSummary | null;
  /** Com 2 ou mais, o agent mostra o seletor com estes chamados. Senão, vazio. */
  ambiguousCandidates: TicketSummary[];
}

const TICKET_CODE_PATTERN = /\b(inc|req)[\s-]*(\d{5})\b/;

/** Palavras que não ajudam a achar um chamado pelo título. */
const IGNORED_WORDS = new Set([
  "chamado",
  "chamados",
  "pedido",
  "ticket",
  "meu",
  "minha",
  "meus",
  "minhas",
  "esse",
  "essa",
  "este",
  "esta",
  "aquele",
  "aquela",
  "sobre",
  "com",
  "dos",
  "das",
  "que",
  "uma",
  "para",
]);

/** Palavras com menos letras que isto ("o", "do", "de") também são ignoradas. */
const MIN_WORD_LENGTH = 3;

export function resolveFocusedTicket(input: FocusedTicketInput): FocusedTicketResolution {
  const ref = input.ticketRef?.trim() ?? "";

  const code = extractTicketCode(ref);
  if (code) return single(findByCode(input.employeeTickets, code));

  const refWords = meaningfulWords(ref);
  if (refWords.length > 0) return matchByTitle(input.employeeTickets, refWords);

  const selected = input.selectedTicketCode;
  return single(selected ? findByCode(input.employeeTickets, selected) : null);
}

/** "inc 20311" vira "INC-20311"; texto sem código dá `null`. */
export function extractTicketCode(text: string): TicketCode | null {
  const match = TICKET_CODE_PATTERN.exec(normalizeText(text));
  if (!match) return null;
  return `${match[1].toUpperCase()}-${match[2]}`;
}

function findByCode(tickets: TicketSummary[], code: TicketCode): TicketSummary | null {
  return tickets.find((ticket) => ticket.code === code) ?? null;
}

function meaningfulWords(text: string): string[] {
  return splitWords(text).filter(
    (word) => word.length >= MIN_WORD_LENGTH && !IGNORED_WORDS.has(word),
  );
}

function matchByTitle(tickets: TicketSummary[], refWords: string[]): FocusedTicketResolution {
  const scored = tickets.map((ticket) => ({ ticket, score: countSharedWords(ticket, refWords) }));
  const bestScore = Math.max(0, ...scored.map((entry) => entry.score));
  if (bestScore === 0) return single(null);

  const best = scored.filter((entry) => entry.score === bestScore).map((entry) => entry.ticket);
  if (best.length === 1) return single(best[0]);
  return { focusedTicket: null, ambiguousCandidates: best };
}

function countSharedWords(ticket: TicketSummary, refWords: string[]): number {
  const titleWords = new Set(splitWords(ticket.title));
  return refWords.filter((word) => titleWords.has(word)).length;
}

function single(ticket: TicketSummary | null): FocusedTicketResolution {
  return { focusedTicket: ticket, ambiguousCandidates: [] };
}
