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
    String.raw`\bdeixei pront[oa]\b`,
    String.raw`\b(confira|confirme|revise)\b[^.!?\n]*\b(rascunho|atualiza\w*|reabertura)\b`,
    String.raw`\b(rascunho|atualiza\w*|reabertura)\b[^.!?\n]*\bno card\b`,
  ].join("|"),
  "i",
);

/** O texto diz que preparou um rascunho, uma atualização ou uma reabertura para conferir. */
export function claimsPreparedDraft(text: string): boolean {
  return DRAFT_CLAIM.test(text);
}

/**
 * O texto promete um card de rascunho, mas nenhuma tool de proposta rodou: o turno precisa de
 * uma nova tentativa do AGIR. Com rascunho pendente de outro turno, falar dele é legítimo.
 */
export function needsDraftRetry(input: {
  text: string;
  draftProposed: boolean;
  pendingDraftExists: boolean;
}): boolean {
  if (input.draftProposed || input.pendingDraftExists) return false;
  return claimsPreparedDraft(input.text);
}

/** Instrução extra da nova tentativa, no fim do contexto do turno. */
export function draftRetryInstruction(firstText: string): string {
  return `## Correção (decidida em código)
Na tentativa anterior deste turno você respondeu "${firstText.trim()}", mas não chamou nenhuma tool de proposta, então nenhum card apareceu. Agora chame a tool certa (findSimilarTickets e depois proposeTicketUpdate, proposeReopen ou proposeTicketDraft) ANTES de responder. Se faltar informação para propor, pergunte o que falta, sem dizer que preparou nada.`;
}

/** Resultado da nova tentativa: o texto dela, se cumpriu; senão, a resposta honesta. */
export function resolveDraftRetry(input: { retryText: string | null; draftProposed: boolean }): {
  text: string;
  correction: ReplyCorrection;
} {
  const usable =
    input.retryText !== null &&
    input.retryText.trim() !== "" &&
    (input.draftProposed || !claimsPreparedDraft(input.retryText));
  if (usable && input.retryText !== null) {
    return {
      text: input.retryText,
      correction: {
        rule: "draft_claim_without_draft",
        explanation: input.draftProposed
          ? "O texto dizia que o rascunho estava pronto sem chamar a tool de proposta: uma nova tentativa do AGIR propôs o rascunho."
          : "O texto dizia que o rascunho estava pronto sem chamar a tool de proposta: a nova tentativa do AGIR respondeu sem prometer o card.",
      },
    };
  }
  return {
    text: DRAFT_CLAIM_FALLBACK_TEXT,
    correction: {
      rule: "draft_claim_without_draft",
      explanation:
        "O texto dizia que o rascunho estava pronto sem chamar a tool de proposta, e a nova tentativa também não propôs: a resposta virou um aviso honesto.",
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
