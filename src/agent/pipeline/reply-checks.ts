import type { ReplyCorrection } from "@/domain/decision-record";
import type { Intent } from "@/domain/enums";

// Regras conferidas em código depois do AGIR (decisão 25), no espírito de "regras garantidas
// em código, não em prompt". Cada regra é uma função pura: recebe o que o modelo produziu e
// devolve a versão corrigida com a `ReplyCorrection` que vai para o `DecisionRecord`, ou
// `null` quando não há o que corrigir. Quem aplica é o `run-turn`.

/** Resposta da privacidade (§3.4): não confirma se o chamado existe nem de quem é. */
export const NOT_FOUND_TEXT = "Não encontrei esse chamado entre os seus.";
/** Oferta de F2 quando nenhum chamado do funcionário combina com o que ele pediu. */
export const OPEN_TICKET_OFFER_TEXT = "Se for um problema novo, posso abrir um chamado para você.";
/** Opções fixas da oferta, como as da oferta de analista do vencido. */
export const OPEN_TICKET_OPTION = "Abrir um chamado";
export const NO_THANKS_OPTION = "Não precisa";
/** Quando nem a nova tentativa propôs o rascunho que o texto prometia. */
export const DRAFT_CLAIM_FALLBACK_TEXT =
  "Desculpe, não consegui preparar o rascunho agora. Pode me mandar a mensagem de novo?";

const TICKET_CODE = /\b(INC|REQ)-\d{5}\b/gi;

/** Códigos de chamado citados, normalizados ("inc-20395" vira "INC-20395"), sem repetição. */
export function extractTicketCodes(text: string): string[] {
  const codes = (text.match(TICKET_CODE) ?? []).map((code) => code.toUpperCase());
  return [...new Set(codes)];
}

// ---------- Regra 1: todo código citado é do funcionário ----------

export interface CodeCheckInput {
  text: string;
  quickReplies: string[] | null;
  /** Códigos dos chamados do funcionário, vindos do serviço de chamados. */
  ownCodes: ReadonlySet<string>;
}

export interface CodeCheckResult {
  text: string;
  quickReplies: string[] | null;
  correction: ReplyCorrection;
}

/**
 * Código de chamado que não é do funcionário (inventado pelo modelo ou repetido da mensagem)
 * não pode aparecer (§3.4). Opção rápida com código alheio sai; texto com código alheio vira
 * a resposta da privacidade, sem o código.
 */
export function checkTicketCodes(input: CodeCheckInput): CodeCheckResult | null {
  const isForeign = (code: string) => !input.ownCodes.has(code);
  const foreignInText = extractTicketCodes(input.text).filter(isForeign);
  const keptReplies = input.quickReplies?.filter(
    (label) => !extractTicketCodes(label).some(isForeign),
  );
  const removedReplies = (input.quickReplies?.length ?? 0) - (keptReplies?.length ?? 0);
  if (foreignInText.length === 0 && removedReplies === 0) return null;

  const what = [
    foreignInText.length > 0 ? "no texto" : null,
    removedReplies > 0 ? `em ${removedReplies} opção(ões) rápida(s)` : null,
  ]
    .filter((item) => item !== null)
    .join(" e ");
  const fix = [
    foreignInText.length > 0 ? "o texto virou a resposta da privacidade" : null,
    removedReplies > 0 ? "as opções com código alheio saíram" : null,
  ]
    .filter((item) => item !== null)
    .join(" e ");
  return {
    text: foreignInText.length > 0 ? NOT_FOUND_TEXT : input.text,
    quickReplies: keptReplies && keptReplies.length > 0 ? keptReplies : null,
    correction: {
      rule: "foreign_ticket_code",
      explanation: `O modelo citou código de chamado que não é do funcionário ${what}: ${fix}.`,
    },
  };
}

// ---------- Regra 2: "preparei o rascunho" exige o rascunho ----------

const DRAFT_CLAIM = new RegExp(
  [
    String.raw`\bpreparei\b`,
    String.raw`\b(vou|estou) prepar(ar|ando)\b`,
    String.raw`\bdeixei pront[oa]\b`,
    String.raw`\b(confira|confirme|revise)\b[^.!?\n]*\b(rascunho|atualiza\w*|reabertura)\b`,
    String.raw`\b(rascunho|atualiza\w*|reabertura)\b[^.!?\n]*\bno card\b`,
  ].join("|"),
  "i",
);

/** "Confira o card", sem dizer qual: só é legítimo se a resposta mostra algum card. */
const POINTS_TO_CARD = /\b(confira|confirme|revise|verifique)\b[^.!?\n]*\bcard\b/i;

/** O texto diz que preparou um rascunho, uma atualização ou uma reabertura para conferir. */
export function claimsPreparedDraft(text: string): boolean {
  return DRAFT_CLAIM.test(text);
}

/**
 * O texto promete um card de rascunho: diz que preparou, ou manda conferir um card quando a
 * resposta não mostra nenhum outro card (de chamado ou seletor).
 */
export function promisesDraftCard(text: string, otherCardShown: boolean): boolean {
  return claimsPreparedDraft(text) || (!otherCardShown && POINTS_TO_CARD.test(text));
}

/**
 * Por que o turno precisa de uma nova tentativa do AGIR, ou `null`:
 * - `claim`: o texto promete um card de rascunho, mas nenhuma tool de proposta rodou;
 * - `critical`: a CriticalPolicy mandou propor o rascunho neste turno (§6.3) e ele não saiu.
 * Com rascunho pendente de outro turno, falar dele é legítimo e não há nova tentativa.
 */
export type DraftRetryReason = "claim" | "critical";

export function draftRetryReason(input: {
  text: string;
  draftProposed: boolean;
  pendingDraftExists: boolean;
  /** A resposta mostra card de chamado, de artigo ou seletor. */
  otherCardShown: boolean;
  criticalCase: boolean;
}): DraftRetryReason | null {
  if (input.draftProposed || input.pendingDraftExists) return null;
  if (input.criticalCase) return "critical";
  return promisesDraftCard(input.text, input.otherCardShown) ? "claim" : null;
}

/** Instrução extra da nova tentativa, no fim do contexto do turno. */
export function draftRetryInstruction(input: {
  reason: DraftRetryReason;
  previousText: string;
  similarConsulted: boolean;
}): string {
  const tools = input.similarConsulted
    ? "findSimilarTickets já foi chamada neste turno: chame direto a tool de proposta certa (proposeTicketUpdate, proposeReopen ou proposeTicketDraft)"
    : "chame findSimilarTickets e depois a tool de proposta certa (proposeTicketUpdate, proposeReopen ou proposeTicketDraft)";
  const previous = `Na tentativa anterior deste turno você respondeu "${input.previousText.trim()}"`;
  if (input.reason === "critical") {
    return `## Correção (decidida em código)
CASO CRÍTICO: o rascunho precisa sair neste turno, sem perguntas. ${previous}, sem propor o rascunho. Agora ${tools} ANTES de escrever a resposta, com os fatos que o funcionário já deu.`;
  }
  return `## Correção (decidida em código)
${previous}, mas não chamou nenhuma tool de proposta, então nenhum card apareceu. Agora ${tools} ANTES de escrever a resposta. Se faltar informação para propor, pergunte o que falta, sem dizer que preparou nada.`;
}

/** A nova tentativa resolveu: propôs o rascunho ou, fora do crítico, respondeu sem prometer. */
export function retrySucceeded(input: {
  reason: DraftRetryReason;
  retryText: string | null;
  draftProposed: boolean;
  otherCardShown: boolean;
}): boolean {
  if (input.draftProposed) return true;
  if (input.reason === "critical" || input.retryText === null) return false;
  return input.retryText.trim() !== "" && !promisesDraftCard(input.retryText, input.otherCardShown);
}

const RETRY_PROBLEM: Record<DraftRetryReason, string> = {
  claim: "O texto dizia que o rascunho estava pronto sem chamar a tool de proposta",
  critical: "Caso crítico sem o rascunho que a CriticalPolicy exige neste turno",
};

/** Resultado das novas tentativas: o texto da última, se resolveu; senão, a resposta honesta. */
export function resolveDraftRetry(input: {
  reason: DraftRetryReason;
  retryText: string | null;
  draftProposed: boolean;
  otherCardShown: boolean;
}): { text: string; correction: ReplyCorrection } {
  const rule = input.reason === "critical" ? "critical_without_draft" : "draft_claim_without_draft";
  const problem = RETRY_PROBLEM[input.reason];
  if (retrySucceeded(input) && input.retryText !== null && input.retryText.trim() !== "") {
    return {
      text: input.retryText,
      correction: {
        rule,
        explanation: input.draftProposed
          ? `${problem}: uma nova tentativa do AGIR propôs o rascunho.`
          : `${problem}: a nova tentativa do AGIR respondeu sem prometer o card.`,
      },
    };
  }
  return {
    text: DRAFT_CLAIM_FALLBACK_TEXT,
    correction: {
      rule,
      explanation: `${problem}, e as novas tentativas também não propuseram: a resposta virou um aviso honesto.`,
    },
  };
}

// ---------- Regra 3: nenhum chamado encontrado oferece abrir um (F2) ----------

const SAYS_NOT_FOUND = /não (encontrei|achei|localizei)/i;

/** O texto diz que não encontrou o chamado ("Não encontrei esse chamado entre os seus"). */
export function saysNotFound(text: string): boolean {
  return SAYS_NOT_FOUND.test(text);
}
const OFFERS_TO_OPEN = /\b(abrir|abra|abro)\b/i;

/**
 * F2, "nenhum: informa e oferece abrir um chamado". Vale numa consulta de chamado em que nada
 * do funcionário combina e a resposta não mostrou nenhum chamado dele, quando ele citou um
 * chamado específico (`ticketRef`, dispositivo ou sistema) ou o próprio texto diz que não
 * encontrou (o ENTENDER às vezes deixa a referência nula). "Quais são meus chamados?" não cita
 * chamado específico e a resposta não diz "não encontrei", então não entra.
 */
export function isNoTicketFound(input: {
  intent: Intent;
  /** O chamado que ele citou: `ticketRef` ou, na falta, o dispositivo ou o sistema. */
  ticketReference: string | null;
  ticketsConsulted: boolean;
  focusedOrAmbiguous: boolean;
  /** A resposta mostrou card, seletor ou rascunho, ou citou um código do funcionário. */
  showedOwnTicket: boolean;
  /** O texto do modelo diz que não encontrou. */
  saysNotFound: boolean;
}): boolean {
  return (
    input.intent === "ticket_status" &&
    (input.ticketReference !== null || input.saysNotFound) &&
    input.ticketsConsulted &&
    !input.focusedOrAmbiguous &&
    !input.showedOwnTicket
  );
}

export interface NoTicketOffer {
  text: string;
  quickReplies: string[];
  correction: ReplyCorrection | null;
}

/**
 * O texto precisa dizer que não encontrou e oferecer abrir um chamado; as opções são fixas
 * em código (o modelo chegou a inventar códigos nelas).
 */
export function offerToOpenTicket(text: string): NoTicketOffer {
  const quickReplies = [OPEN_TICKET_OPTION, NO_THANKS_OPTION];
  if (!saysNotFound(text)) {
    return {
      text: `${NOT_FOUND_TEXT} ${OPEN_TICKET_OFFER_TEXT}`,
      quickReplies,
      correction: {
        rule: "no_ticket_found_offer",
        explanation:
          "Nenhum chamado do funcionário combina com o pedido, e o texto não dizia isso: virou a resposta de F2 (não encontrou e oferece abrir um chamado).",
      },
    };
  }
  if (!OFFERS_TO_OPEN.test(text)) {
    return {
      text: `${text.trimEnd()} ${OPEN_TICKET_OFFER_TEXT}`,
      quickReplies,
      correction: {
        rule: "no_ticket_found_offer",
        explanation:
          "Nenhum chamado do funcionário combina com o pedido, e o texto não oferecia abrir um: a oferta de F2 foi acrescentada.",
      },
    };
  }
  return { text, quickReplies, correction: null };
}

// ---------- Regra 4: chamada de tool escrita como texto sai da resposta ----------

/** As tools do AGIR (`createTools`). Um destes nomes seguido de "(" no texto é chamada vazada. */
export const AGENT_TOOL_NAMES = [
  "searchKnowledgeBase",
  "listMyTickets",
  "getMyTicket",
  "findSimilarTickets",
  "selectTicket",
  "showTicketSelector",
  "offerQuickReplies",
  "proposeTicketDraft",
  "proposeTicketUpdate",
  "proposeReopen",
  "requestHandoff",
] as const;

const TOOL_CALL_START = new RegExp(String.raw`\b(${AGENT_TOOL_NAMES.join("|")})\s*\(`, "g");

/** Quando não sobra nada além da chamada, a resposta não fica vazia. */
export const TOOL_CALL_FALLBACK_TEXT =
  "Desculpe, me atrapalhei na resposta. Pode me mandar a mensagem de novo?";

/**
 * Onde termina a chamada cujo "(" está em `openIndex`: logo depois do ")" que o fecha,
 * contando os parênteses fora de aspas. Sem fechamento, a chamada vai até o fim do texto.
 */
function findCallEnd(text: string, openIndex: number): number {
  let depth = 0;
  let inString = false;
  for (let index = openIndex; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (char === "\\") index++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "(") depth++;
    else if (char === ")" && --depth === 0) return index + 1;
  }
  return text.length;
}

/** O texto sem as chamadas, arrumado (crases vazias, espaços e linhas em branco a mais). */
function stripToolCalls(text: string): { text: string; toolNames: string[] } {
  const toolNames: string[] = [];
  let kept = "";
  let cursor = 0;
  for (const match of text.matchAll(TOOL_CALL_START)) {
    if (match.index < cursor) continue; // dentro de uma chamada já removida
    toolNames.push(match[1]!);
    kept += text.slice(cursor, match.index);
    cursor = findCallEnd(text, match.index + match[0].length - 1);
  }
  kept += text.slice(cursor);

  const tidy = kept
    .replace(/```\w*\s*```/g, "") // bloco de código que só tinha a chamada
    .replace(/``/g, "") // crases que só cercavam a chamada
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
  return { text: tidy, toolNames };
}

/**
 * O modelo às vezes escreve a chamada da tool como texto em vez de chamá-la (achado da T10b:
 * `offerQuickReplies({"options":[...]})`). A chamada não aconteceu e o trecho só confunde o
 * funcionário, então sai do texto. Se não sobrar nada, a resposta vira um aviso honesto.
 */
export function removeToolCallsFromText(
  text: string,
): { text: string; correction: ReplyCorrection } | null {
  const stripped = stripToolCalls(text);
  if (stripped.toolNames.length === 0) return null;

  const names = [...new Set(stripped.toolNames)].join(", ");
  const nothingLeft = stripped.text === "";
  return {
    text: nothingLeft ? TOOL_CALL_FALLBACK_TEXT : stripped.text,
    correction: {
      rule: "tool_call_as_text",
      explanation: nothingLeft
        ? `O modelo escreveu a chamada de ${names} como texto e não sobrou resposta: virou um aviso honesto.`
        : `O modelo escreveu a chamada de ${names} como texto: o trecho saiu da resposta.`,
    },
  };
}
