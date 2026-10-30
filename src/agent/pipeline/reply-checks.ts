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
 * - `critical`: a CriticalPolicy mandou propor o rascunho neste turno (§6.3) e ele não saiu;
 * - `duplicate`: há um chamado aberto parecido e o texto pergunta sobre ele em vez de propor a
 *   atualização (o card do rascunho é a pergunta de confirmação, §3.2).
 * Com rascunho pendente de outro turno, falar dele é legítimo e não há nova tentativa.
 */
export type DraftRetryReason = "claim" | "critical" | "duplicate";

export function draftRetryReason(input: {
  text: string;
  draftProposed: boolean;
  pendingDraftExists: boolean;
  /** A resposta mostra card de chamado, de artigo ou seletor. */
  otherCardShown: boolean;
  criticalCase: boolean;
  /** Chamados abertos parecidos (sugestão "atualizar") consultados neste turno. */
  openDuplicateCodes?: string[];
  /** O problema voltou ("continua sem imprimir"): com um único aberto, o caminho é atualizá-lo. */
  recurringProblem?: boolean;
}): DraftRetryReason | null {
  if (input.draftProposed || input.pendingDraftExists) return null;
  if (input.criticalCase) return "critical";
  if (promisesDraftCard(input.text, input.otherCardShown)) return "claim";
  return asksAboutDuplicate(input.text, input.openDuplicateCodes ?? [], input.recurringProblem)
    ? "duplicate"
    : null;
}

/**
 * "É o mesmo problema que já está no INC-20395?": pergunta citando o único parecido aberto, ou
 * qualquer pergunta num problema que voltou com um único aberto (F4: atualizar, não perguntar).
 */
function asksAboutDuplicate(text: string, openCodes: string[], recurring = false): boolean {
  if (openCodes.length !== 1 || !/\?\s*$/.test(text.trim())) return false;
  return recurring || extractTicketCodes(text).includes(openCodes[0]);
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
  if (input.reason === "duplicate") {
    return `## Correção (decidida em código)
${previous}, perguntando sobre o chamado aberto parecido em vez de propor. O card do rascunho é a pergunta de confirmação: se for o mesmo problema, chame AGORA proposeTicketUpdate com esse chamado e peça para conferir no card; não pergunte em texto.`;
  }
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
  if (input.reason !== "claim" || input.retryText === null) return false;
  return input.retryText.trim() !== "" && !promisesDraftCard(input.retryText, input.otherCardShown);
}

const RETRY_PROBLEM: Record<DraftRetryReason, string> = {
  claim: "O texto dizia que o rascunho estava pronto, mas ele não tinha sido criado",
  critical: "Caso crítico sem o rascunho, que a regra de caso crítico exige já neste turno",
  duplicate: "O texto perguntava sobre o chamado aberto parecido em vez de propor a atualização",
};

/** Resultado das novas tentativas: o texto da última, se resolveu; senão, a resposta honesta. */
export function resolveDraftRetry(input: {
  reason: DraftRetryReason;
  retryText: string | null;
  draftProposed: boolean;
  otherCardShown: boolean;
  /** O texto da primeira resposta: na duplicidade sem proposta, a pergunta dela fica. */
  firstText?: string;
}): { text: string; correction: ReplyCorrection } {
  const rule = input.reason === "critical" ? "critical_without_draft" : "draft_claim_without_draft";
  const problem = RETRY_PROBLEM[input.reason];
  if (retrySucceeded(input) && input.retryText !== null && input.retryText.trim() !== "") {
    return {
      text: input.retryText,
      correction: {
        rule,
        explanation: input.draftProposed
          ? `${problem}: o agent tentou de novo e propôs o rascunho.`
          : `${problem}: o agent tentou de novo e respondeu sem prometer o card.`,
      },
    };
  }
  if (input.reason === "duplicate") {
    return {
      text: input.firstText ?? DRAFT_CLAIM_FALLBACK_TEXT,
      correction: {
        rule: "draft_claim_without_draft",
        explanation: `${problem}; a nova tentativa também não propôs, e a pergunta ficou.`,
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
          "Nenhum chamado do funcionário combina com o pedido, e o texto não dizia isso: a resposta passou a dizer que não encontrou e a oferecer abrir um chamado.",
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
          "Nenhum chamado do funcionário combina com o pedido, e o texto não oferecia abrir um: a oferta de abrir um chamado foi acrescentada.",
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
function stripToolCalls(text: string): {
  text: string;
  toolNames: string[];
  /** As opções da primeira chamada de `offerQuickReplies` escrita, se trouxer alguma. */
  offeredOptions: string[] | null;
} {
  const toolNames: string[] = [];
  let offeredOptions: string[] | null = null;
  let kept = "";
  let cursor = 0;
  for (const match of text.matchAll(TOOL_CALL_START)) {
    if (match.index < cursor) continue; // dentro de uma chamada já removida
    toolNames.push(match[1]!);
    kept += text.slice(cursor, match.index);
    cursor = findCallEnd(text, match.index + match[0].length - 1);
    const options =
      match[1] === "offerQuickReplies" ? optionsInCall(text.slice(match.index, cursor)) : [];
    if (offeredOptions === null && options.length > 0) offeredOptions = options;
  }
  kept += text.slice(cursor);
  return { text: tidyText(kept), toolNames, offeredOptions };
}

/** Os rótulos do array de uma chamada `offerQuickReplies({"options":[...]})` escrita. */
function optionsInCall(call: string): string[] {
  const array = call.match(/\[([^\]]*)\]?/);
  return array ? parseWrittenOptions(array[1]!) : [];
}

/** Arruma o texto depois de tirar trechos: crases vazias, espaços e linhas em branco a mais. */
function tidyText(text: string): string {
  return text
    .replace(/```\w*\s*```/g, "") // bloco de código que só tinha o trecho
    .replace(/``/g, "") // crases que só cercavam o trecho
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

/**
 * O modelo às vezes escreve a chamada da tool como texto em vez de chamá-la (achado da T10b:
 * `offerQuickReplies({"options":[...]})`). A chamada não aconteceu e o trecho só confunde o
 * funcionário, então sai do texto. Se não sobrar nada, a resposta vira um aviso honesto.
 * As opções de um `offerQuickReplies` escrito voltam em `quickReplies` (quem chama decide se
 * viram a parte de opções); com o aviso honesto, não voltam.
 */
export function removeToolCallsFromText(
  text: string,
  /** A resposta já tem a parte de opções (a tool foi chamada de verdade). */
  hasQuickReplies = false,
): { text: string; quickReplies: string[] | null; correction: ReplyCorrection } | null {
  const stripped = stripToolCalls(text);
  if (stripped.toolNames.length === 0) return null;

  const nothingLeft = stripped.text === "";
  const quickReplies = nothingLeft || hasQuickReplies ? null : stripped.offeredOptions;
  return {
    text: nothingLeft ? TOOL_CALL_FALLBACK_TEXT : stripped.text,
    quickReplies,
    correction: {
      rule: "tool_call_as_text",
      explanation: nothingLeft
        ? "O modelo escreveu um comando interno no texto e não sobrou resposta: virou um aviso honesto."
        : quickReplies
          ? "O modelo escreveu um comando interno no texto: o trecho saiu da resposta e as opções escritas viraram botões."
          : "O modelo escreveu um comando interno no texto: o trecho saiu da resposta.",
    },
  };
}

// ---------- Regra 5: resposta sem texto e sem partes não vira balão vazio ----------

/** Opção da resposta honesta da regra 5, ao lado de "Abrir um chamado". */
export const TALK_TO_ANALYST_OPTION = "Falar com um analista";

/** Quando nem a nova tentativa respondeu: pede para reformular e oferece as saídas. */
export const EMPTY_REPLY_FALLBACK_TEXT =
  "Desculpe, não consegui montar a resposta agora. Pode reformular a mensagem? Se preferir, posso abrir um chamado ou chamar um analista.";

/**
 * Instrução extra da nova tentativa. O gpt-oss às vezes escreve a pergunta e as opções só no
 * raciocínio e encerra o passo sem texto nem tool (achado do "mouse sem fio parou").
 */
export const EMPTY_REPLY_RETRY_INSTRUCTION = `## Correção (decidida em código)
Na tentativa anterior deste turno você terminou sem escrever nada para o funcionário e sem chamar nenhuma tool que mostre algo a ele. Agora escreva a resposta em texto. Para oferecer opções, chame a tool offerQuickReplies; não deixe a resposta nem as opções só no raciocínio.`;

/** A resposta do AGIR não tem texto nem partes (cards, seletor, rascunho, opções). */
export function isEmptyReply(input: { text: string; hasParts: boolean }): boolean {
  return input.text.trim() === "" && !input.hasParts;
}

/**
 * Resultado da nova tentativa: `fallback` nulo quando ela respondeu (texto ou partes);
 * senão, a resposta honesta com as opções fixas em código.
 */
export function resolveEmptyReply(input: {
  retryOk: boolean;
  retryText: string;
  retryHasParts: boolean;
}): {
  fallback: { text: string; quickReplies: string[] } | null;
  correction: ReplyCorrection;
} {
  const problem = "O modelo terminou sem texto e sem nada para mostrar";
  const answered =
    input.retryOk && !isEmptyReply({ text: input.retryText, hasParts: input.retryHasParts });
  if (answered) {
    return {
      fallback: null,
      correction: {
        rule: "empty_reply",
        explanation: `${problem}: o agent tentou de novo e respondeu.`,
      },
    };
  }
  return {
    fallback: {
      text: EMPTY_REPLY_FALLBACK_TEXT,
      quickReplies: [OPEN_TICKET_OPTION, TALK_TO_ANALYST_OPTION],
    },
    correction: {
      rule: "empty_reply",
      explanation: `${problem}, e a nova tentativa também não respondeu: a resposta virou um aviso honesto.`,
    },
  };
}

// ---------- Regra 6: opções rápidas escritas como texto viram a parte de opções ----------

/** Máximo de opções da tool `offerQuickReplies`. */
const MAX_QUICK_REPLIES = 4;
/** Opção rápida é curta: item de lista mais longo que isto é passo ou explicação. */
const MAX_LIST_LABEL_LENGTH = 40;
const MAX_LIST_LABEL_WORDS = 5;
/** Rótulo aceito nos formatos explícitos (marcação, JSON); mais longo que isto é descartado. */
const MAX_EXPLICIT_LABEL_LENGTH = 60;

/** Quando só sobraram as opções: o texto não fica vazio acima delas. */
export const QUICK_REPLIES_ONLY_TEXT = "Escolha uma das opções abaixo.";

const OPTIONS_WORD = String.raw`(?:op[çc][õo]es(?:\s+r[áa]pidas)?|options|quick\s*replies)`;

/** `{"options": ["Só eu", ...]}`, com ou sem chaves e aspas na chave. */
const JSON_OPTIONS = new RegExp(
  String.raw`\{?\s*["']?(?:options|op[çc][õo]es|quickReplies)["']?\s*:\s*\[([^\]]*)\]\s*\}?`,
  "gi",
);
/** `[opções: Sim, Não]`. */
const TAG_OPTIONS_INLINE = new RegExp(String.raw`\[\s*${OPTIONS_WORD}\s*:\s*([^\]\n]*)\]`, "gi");
/** `[options] Só eu; Minha equipe` (as opções vão até o fim da linha). */
const TAG_OPTIONS_LINE = new RegExp(String.raw`\[\s*${OPTIONS_WORD}\s*\]\s*:?[ \t]*([^\n]*)`, "gi");
/** Narração entre parênteses ou colchetes: "(oferecendo opções rápidas)", "(opções rápidas: Sim, Não)". */
/** "(Selecione uma opção)", "(escolha uma das opções abaixo)": o parêntese inteiro é a frase. */
const PICK_ONE_NARRATION =
  /[(\[]\s*(?:selecion|escolh|toqu)\w*\s+(?:em\s+)?(?:uma|alguma)\s+(?:das\s+)?op[çc](?:[ãa]o|[õo]es)(?:\s+abaixo)?\s*[)\]]/gi;
const NARRATION = new RegExp(
  String.raw`[(\[][^()\[\]\n]{0,60}?(?:op[çc][õo]es\s+r[áa]pidas|quick\s*replies|offerQuickReplies|(?:oferec|mostr|anex)\w*\s+(?:as\s+|algumas\s+)?op[çc][õo]es)([^()\[\]\n]{0,200}?)[)\]]`,
  "gi",
);
/** Linha que começa com o rótulo "Opções:" (o resto da linha pode trazer as opções). */
const LABEL_LINE = new RegExp(
  String.raw`^[ \t]*\*{0,2}${OPTIONS_WORD}\*{0,2}\s*:\*{0,2}[ \t]*(.*)$`,
  "i",
);
const BULLET_ITEM = /^[ \t]*[-*•][ \t]+(.+?)[ \t]*$/;
const ANY_LIST_ITEM = /^[ \t]*(?:[-*•]|\d+[.)])[ \t]+(.+?)[ \t]*$/;

/**
 * Tira aspas, negrito, marcador e pontuação final de um rótulo. Espaços especiais e hífens
 * tipográficos (o gpt-oss escreve "Windows\u202f11") viram os comuns.
 */
function cleanLabel(label: string): string {
  return label
    .replace(/\s+/g, " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .trim()
    .replace(/^(?:[-•]|\d+[.)])\s+/, "")
    .replace(/^["'“”‘’`*]+|["'“”‘’`*]+$/g, "")
    .replace(/[.;,]+$/, "")
    .trim();
}

/** Opções escritas numa linha: entre aspas, ou separadas por ";", "|", " - ", vírgula ou "ou". */
function splitInlineOptions(raw: string): string[] {
  const quoted = [...raw.matchAll(/"((?:[^"\\]|\\.)*)"|“([^”]*)”/g)].map(
    (match) => match[1] ?? match[2] ?? "",
  );
  if (quoted.length > 0) return quoted.map(cleanLabel);
  const trimmed = raw.trim().replace(/^[-•]\s+/, "");
  const separator = /[;|]/.test(trimmed)
    ? /\s*[;|]\s*/
    : /\s[-•]\s/.test(trimmed)
      ? /\s+[-•]\s+/
      : /\s*,\s*|\s+ou\s+/;
  return trimmed.split(separator).map(cleanLabel);
}

/** Rótulos não vazios e não longos, sem repetição, no máximo quatro. */
function usableLabels(labels: string[], maxLength: number): string[] {
  const kept = labels.filter((label) => label !== "" && label.length <= maxLength);
  return [...new Set(kept)].slice(0, MAX_QUICK_REPLIES);
}

/** As opções escritas num formato explícito (`[...]` do JSON, resto da linha da marcação). */
export function parseWrittenOptions(raw: string): string[] {
  return usableLabels(splitInlineOptions(raw), MAX_EXPLICIT_LABEL_LENGTH);
}

/** Item de lista que pode ser opção rápida: curto, sem ponto final nem dois-pontos. */
function isShortOption(raw: string): boolean {
  const label = cleanLabel(raw);
  return (
    label !== "" &&
    label.length <= MAX_LIST_LABEL_LENGTH &&
    label.split(/\s+/).length <= MAX_LIST_LABEL_WORDS &&
    !/[.:]\**$/.test(raw.trim())
  );
}

/** 2 a 4 itens, todos curtos: o critério de lista que vira opções rápidas. */
function looksLikeOptions(rawItems: string[]): boolean {
  return (
    rawItems.length >= 2 && rawItems.length <= MAX_QUICK_REPLIES && rawItems.every(isShortOption)
  );
}

interface Found {
  labels: string[];
  format: string;
}

/** A lista no fim das linhas (ignorando linhas em branco no fim): onde começa e os itens. */
function trailingList(lines: string[], item: RegExp): { start: number; rawItems: string[] } | null {
  let end = lines.length;
  while (end > 0 && lines[end - 1]!.trim() === "") end--;
  let start = end;
  while (start > 0 && item.test(lines[start - 1]!)) start--;
  if (start === end) return null;
  const rawItems = lines.slice(start, end).map((line) => line.match(item)![1]!);
  return { start, rawItems };
}

/**
 * "Opções:" no fim do texto, com as opções na mesma linha ("Opções: - Sim - Não") ou numa
 * lista logo abaixo.
 */
function takeLabeledList(text: string): { text: string; found: Found } | null {
  const lines = text.split("\n");
  let end = lines.length;
  while (end > 0 && lines[end - 1]!.trim() === "") end--;
  const list = trailingList(lines.slice(0, end), ANY_LIST_ITEM);
  const labelIndex = list ? list.start - 1 : end - 1;
  const label = labelIndex >= 0 ? lines[labelIndex]!.match(LABEL_LINE) : null;
  if (!label) return null;
  const inline = label[1]!.trim();
  if (list && inline !== "") return null;
  const rawItems = list ? list.rawItems : splitInlineOptions(inline);
  if (!looksLikeOptions(rawItems)) return null;
  return {
    text: lines.slice(0, labelIndex).join("\n"),
    found: {
      labels: usableLabels(rawItems.map(cleanLabel), MAX_LIST_LABEL_LENGTH),
      format: "lista com o rótulo Opções",
    },
  };
}

/** Pergunta seguida de uma lista com marcadores (não numerada) no fim do texto. */
function takeListAfterQuestion(text: string): { text: string; found: Found } | null {
  const lines = text.split("\n");
  const list = trailingList(lines, BULLET_ITEM);
  if (!list || !looksLikeOptions(list.rawItems)) return null;
  const question = lines
    .slice(0, list.start)
    .reverse()
    .find((line) => line.trim() !== "");
  if (!question?.trim().endsWith("?")) return null;
  return {
    text: lines.slice(0, list.start).join("\n"),
    found: {
      labels: usableLabels(list.rawItems.map(cleanLabel), MAX_LIST_LABEL_LENGTH),
      format: "lista depois da pergunta",
    },
  };
}

/** Tira os trechos do padrão; `parse` lê as opções do grupo capturado. */
function takePattern(
  text: string,
  pattern: RegExp,
  format: string,
  parse: (raw: string) => string[],
  found: Found[],
): string {
  return text.replace(pattern, (_whole, raw: string | undefined) => {
    found.push({ labels: parse(raw ?? ""), format });
    return "";
  });
}

/** Narração só traz opções depois de dois-pontos: "(opções rápidas: Sim, Não)". */
function parseNarratedOptions(raw: string): string[] {
  const afterColon = raw.match(/^\s*:\s*(.+)$/);
  return afterColon ? parseWrittenOptions(afterColon[1]!) : [];
}

/**
 * Opções entre parênteses logo depois de uma pergunta: "Isso resolveu? (Sim/Não)", "Qual é o
 * seu Windows? (Windows 10, Windows 11 ou Não sei)". Só com "/" ou "ou" separando 2 a 4 itens
 * curtos: "(por exemplo, a Cisco)" fica.
 */
function takeQuestionChoices(text: string, found: Found[]): string {
  return text.replace(/\?[ \t]*\(([^()\n]{1,120})\)/g, (whole, inner: string) => {
    if (!/\/|\s+ou\s+/.test(inner)) return whole;
    const rawItems = inner.split(/\s*\/\s*|\s*,\s*|\s+ou\s+/);
    if (!looksLikeOptions(rawItems)) return whole;
    found.push({
      labels: usableLabels(rawItems.map(cleanLabel), MAX_LIST_LABEL_LENGTH),
      format: "opções entre parênteses depois da pergunta",
    });
    return "?";
  });
}

/**
 * As opções que a tool já anexou, repetidas entre parênteses no texto: "Qual é o seu Windows?
 * (Windows 10, Windows 11 ou Não sei)". Só vale com 2 ou mais rótulos, todos da tool.
 */
function takeEchoedOptions(text: string, toolLabels: string[], found: Found[]): string {
  const known = new Set(toolLabels.map((label) => cleanLabel(label).toLowerCase()));
  return text.replace(/\(([^()\n]{1,200})\)/g, (whole, inner: string) => {
    const labels = splitInlineOptions(inner).filter((label) => label !== "");
    const echoed = labels.length >= 2 && labels.every((label) => known.has(label.toLowerCase()));
    if (!echoed) return whole;
    found.push({ labels: [], format: "opções dos botões repetidas no texto" });
    return "";
  });
}

export interface WrittenQuickReplies {
  text: string;
  /** Rótulos tirados do texto para virar a parte de opções (só quando a tool não anexou). */
  quickReplies: string[] | null;
  /**
   * O texto anunciava opções sem dizer quais ("[options]", "(oferecendo opções)") e a tool não
   * foi chamada: a resposta ficou sem as opções que a pergunta pedia.
   */
  missingOptions: boolean;
  correction: ReplyCorrection;
}

/**
 * O modelo às vezes escreve as opções rápidas no texto em vez de chamar `offerQuickReplies`:
 * `[options] Só eu; Minha equipe`, `{"options": [...]}`, "(oferecendo opções rápidas)",
 * "(Selecione uma opção)", "Opções: - Sim - Não", ou repete entre parênteses as opções que a
 * tool já anexou. O trecho sai do texto e, se a resposta ainda não tem opções, os rótulos
 * viram a parte `quickReplies`. Sem rótulos e sem a tool, `missingOptions` avisa quem chama.
 *
 * Contra falso positivo, lista só conta como opções com sinal claro e no fim do texto: o
 * rótulo "Opções:" logo antes, ou uma pergunta logo antes e itens com marcador (não
 * numerados); e sempre 2 a 4 itens curtos (até 40 caracteres e 5 palavras, sem ponto final
 * nem dois-pontos). Passos de um artigo (numerados, longos, depois de "Siga os passos:")
 * ficam como estão.
 */
export function extractQuickRepliesFromText(input: {
  text: string;
  /** As opções que a tool já anexou à resposta, ou `null`. */
  toolQuickReplies: string[] | null;
}): WrittenQuickReplies | null {
  const toolLabels = input.toolQuickReplies;
  const found: Found[] = [];
  let text = input.text;
  text = takePattern(text, JSON_OPTIONS, "JSON", parseWrittenOptions, found);
  text = takePattern(text, TAG_OPTIONS_INLINE, "marcação [options]", parseWrittenOptions, found);
  text = takePattern(text, TAG_OPTIONS_LINE, "marcação [options]", parseWrittenOptions, found);
  text = takePattern(text, NARRATION, "narração das opções", parseNarratedOptions, found);
  text = takePattern(text, PICK_ONE_NARRATION, "narração das opções", () => [], found);
  text = takeQuestionChoices(text, found);
  if (toolLabels) text = takeEchoedOptions(text, toolLabels, found);
  for (const take of [takeLabeledList, takeListAfterQuestion]) {
    const taken = take(text);
    if (taken) {
      text = taken.text;
      found.push(taken.found);
    }
  }
  if (found.length === 0) return null;

  const labels = found.find((item) => item.labels.length > 0)?.labels ?? null;
  const quickReplies = !toolLabels && labels ? labels : null;
  const missingOptions = !toolLabels && !labels;
  const tidy = tidyText(text);
  const withOptions = toolLabels !== null || quickReplies !== null;
  const formats = [...new Set(found.map((item) => item.format))].join(", ");
  const fix = quickReplies
    ? `o trecho saiu e virou ${quickReplies.length} opção(ões) rápida(s)`
    : toolLabels
      ? "o trecho saiu e as opções da tool ficaram"
      : "o trecho saiu, sem rótulos para virar opções";
  return {
    text: tidy !== "" ? tidy : withOptions ? QUICK_REPLIES_ONLY_TEXT : TOOL_CALL_FALLBACK_TEXT,
    quickReplies,
    missingOptions,
    correction: {
      rule: "quick_replies_as_text",
      explanation: `O modelo escreveu opções rápidas como texto (${formats}): ${fix}.`,
    },
  };
}

/** Instrução extra da nova tentativa quando o texto anunciou opções sem chamar a tool. */
export function quickRepliesRetryInstruction(previousText: string): string {
  return `## Correção (decidida em código)
Na tentativa anterior deste turno você respondeu "${previousText.trim()}" e anunciou opções no texto sem chamar a tool offerQuickReplies, então nenhuma opção apareceu. Agora escreva a pergunta e CHAME offerQuickReplies com as opções; não escreva as opções nem fale delas no texto.`;
}

/**
 * Resultado da nova tentativa: quando ela chamou a tool, fica o texto dela (sem opções
 * escritas) ou, se ela só chamou a tool, o texto da primeira; senão, o texto da primeira
 * tentativa sem o anúncio.
 */
export function resolveQuickRepliesRetry(input: {
  first: WrittenQuickReplies;
  retryText: string | null;
  retryQuickReplies: string[] | null;
}): { text: string; correction: ReplyCorrection } {
  const { first } = input;
  if (input.retryQuickReplies) {
    const retryText = cleanRetryText(input.retryText ?? "", input.retryQuickReplies);
    return {
      text: retryText ?? first.text,
      correction: {
        ...first.correction,
        explanation: `${first.correction.explanation.replace(/\.$/, "")}; o agent tentou de novo e mostrou as opções como botões.`,
      },
    };
  }
  return {
    text: first.text,
    correction: {
      ...first.correction,
      explanation: `${first.correction.explanation.replace(/\.$/, "")}; nem a nova tentativa mostrou as opções como botões.`,
    },
  };
}

/** O texto da nova tentativa sem chamadas nem opções escritas, ou `null` se não sobrar resposta. */
function cleanRetryText(text: string, toolQuickReplies: string[]): string | null {
  const withoutCalls = removeToolCallsFromText(text, true)?.text ?? text;
  const cleaned =
    extractQuickRepliesFromText({ text: withoutCalls, toolQuickReplies })?.text ??
    withoutCalls.trim();
  const fallbacks = [QUICK_REPLIES_ONLY_TEXT, TOOL_CALL_FALLBACK_TEXT, ""];
  return fallbacks.includes(cleaned) ? null : cleaned;
}
