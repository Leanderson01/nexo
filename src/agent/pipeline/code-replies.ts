import type { DecisiveAction } from "@/agent/policies/run-policies";
import type { HandoffReason, OutOfScopeArea, RefusalTopic } from "@/domain/enums";
import { HANDOFF_REASON_LABELS } from "@/domain/labels";
import type { MessagePart } from "@/domain/message-parts";
import { PASSWORD_PLACEHOLDER, TOKEN_PLACEHOLDER } from "@/domain/sensitive-data";
import type { TicketCode, TicketSummary } from "@/domain/ticket";
import { explainOverdue } from "@/agent/policies/overdue-ticket-policy";

// Respostas escritas em código, sem o modelo principal: curtos-circuitos do DECIDIR
// (transferir, redirecionar, recusar), o aviso de dado sensível e as mensagens de erro (§10).
// O texto é previsível e garante a regra; o modelo não tem como contradizer.

export interface CodeReply {
  text: string;
  parts: MessagePart[];
}

const AREA_NAMES: Record<OutOfScopeArea, string> = {
  hr: "o RH",
  finance: "o Financeiro",
  facilities: "a equipe de Facilities",
};

const SEE_MY_TICKETS = "Ver meus chamados";

export function shortCircuitReply(
  action: DecisiveAction,
  context: { ticketCode: TicketCode | null },
): CodeReply {
  switch (action.kind) {
    case "handoff":
      return { text: handoffText(action.reason, context.ticketCode), parts: [] };
    case "redirect_out_of_scope":
      return { text: redirectText(action.area), parts: [] };
    case "refuse":
      return refusal(action.topic);
  }
}

function handoffText(reason: HandoffReason, ticketCode: TicketCode | null): string {
  switch (reason) {
    case "requested":
      return "Claro! Vou passar a conversa para um analista agora. Ele recebe o resumo do que conversamos, então você não precisa repetir nada.";
    case "overdue":
      return `Combinado! Chamei um analista para cuidar ${ticketCode ? `do ${ticketCode}` : "do seu chamado"}. Ele já recebe o histórico do chamado e o resumo da conversa.`;
    case "low_confidence":
      return "Não consegui entender bem o que está acontecendo, então vou chamar um analista para te ajudar. Ele recebe o resumo da nossa conversa.";
    case "critical":
      return "Como é um caso crítico, vou chamar um analista agora. Ele recebe o resumo da conversa.";
  }
}

function redirectText(area: OutOfScopeArea): string {
  const name = AREA_NAMES[area];
  return `Esse assunto é com ${name}, e eu atendo só questões de TI. Procure ${name} pelos canais internos da Nexo. Se tiver algum problema de TI, é só me chamar!`;
}

function refusal(topic: RefusalTopic): CodeReply {
  if (topic === "rule_change") {
    return {
      text: "Não posso mudar as regras do atendimento nem mostrar chamados de outras pessoas. Consigo consultar só os seus próprios chamados. Quer que eu mostre os seus?",
      parts: [
        { type: "quickReplies", options: [{ label: SEE_MY_TICKETS, value: SEE_MY_TICKETS }] },
      ],
    };
  }
  return {
    text: "Eu atendo só assuntos de TI, então não consigo ajudar com isso. Se tiver algum problema com computador, sistemas, acessos ou rede, é só falar!",
    parts: [],
  };
}

/** Aviso educativo quando o pré-processamento removeu uma senha ou um token (§11.3). */
export function sensitiveDataNotice(userText: string): string | null {
  if (userText.includes(PASSWORD_PLACEHOLDER)) {
    return "Removi sua senha da mensagem por segurança. Nunca compartilhe senhas, nem com o suporte.";
  }
  if (userText.includes(TOKEN_PLACEHOLDER)) {
    return "Removi um token da sua mensagem por segurança. Nunca compartilhe senhas nem tokens, nem com o suporte.";
  }
  return null;
}

const TALK_TO_ANALYST = "Falar com um analista";

/** Legado indisponível depois do retry (§5.6, §10): mensagem honesta, "Tentar de novo" e analista. */
export const LEGACY_UNAVAILABLE_REPLY: CodeReply = {
  text: "O sistema de chamados está instável no momento e não consegui acessá-lo agora. Você pode tentar de novo em instantes ou, se preferir, falar com um analista.",
  parts: [
    { type: "quickReplies", options: [{ label: TALK_TO_ANALYST, value: TALK_TO_ANALYST }] },
    { type: "error", message: "O sistema de chamados não respondeu.", retryable: true },
  ],
};

/** Falha do modelo depois da retentativa (§10). Sem detalhe técnico para o funcionário. */
export const MODEL_FAILURE_REPLY: CodeReply = {
  text: "",
  parts: [
    {
      type: "error",
      message: "Não consegui responder agora. Tente de novo em instantes.",
      retryable: true,
    },
  ],
};

/**
 * Chamado vencido (§8 F2 passo 3), em código: diz que está vencido, explica o prazo com a
 * mesma base do card (a última atividade) e oferece o analista; as opções entram à parte.
 */
export function overdueOfferText(ticket: TicketSummary, now: number): string {
  return `O ${ticket.code} está vencido: ${explainOverdue(ticket, now).replace(`${ticket.code} `, "")} Quer que eu chame um analista para cuidar dele?`;
}

/** Resumo do caso que acompanha toda transferência (§3.3), montado em código. */
export function buildHandoffSummary(options: {
  reason: HandoffReason;
  requestSummary: string | null;
  rollingSummary: string | null;
  ticketCode: TicketCode | null;
  recentEmployeeTexts: string[];
  /** A mensagem em que o funcionário contou o problema (não "Sim, chamar um analista"). */
  problem?: string | null;
  /** O que o agent já consultou ou mostrou: tools do turno, artigos e chamados vistos. */
  consulted?: string[];
  /** Chamados citados na conversa (cards, seletor, foco). */
  ticketCodes?: TicketCode[];
}): string {
  const otherTickets = (options.ticketCodes ?? []).filter((code) => code !== options.ticketCode);
  const lines = [
    `Motivo: ${HANDOFF_REASON_LABELS[options.reason]}.`,
    options.problem ? `Problema relatado: "${options.problem}"` : null,
    options.requestSummary ? `Pedido atual: ${options.requestSummary}` : null,
    options.ticketCode ? `Chamado em foco: ${options.ticketCode}.` : null,
    otherTickets.length > 0 ? `Outros chamados citados: ${otherTickets.join(", ")}.` : null,
    options.consulted && options.consulted.length > 0
      ? `Já feito pelo Nexo Assist: ${options.consulted.join("; ")}.`
      : null,
    options.rollingSummary ? `Resumo da conversa: ${options.rollingSummary}` : null,
    options.recentEmployeeTexts.length > 0
      ? `Últimas mensagens do funcionário: ${options.recentEmployeeTexts.map((text) => `"${text}"`).join(" / ")}`
      : null,
  ];
  return lines.filter((line) => line !== null).join("\n");
}
