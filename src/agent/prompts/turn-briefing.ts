import type { GuidingAction } from "@/agent/policies/run-policies";
import type { ArticleForModel } from "@/agent/tools/search-knowledge-base";
import type { PendingAction } from "@/domain/pending-action";
import type { TicketSummary } from "@/domain/ticket";
import type { Understanding } from "@/domain/understanding";

import { ticketLine } from "../tools/ticket-view";

// "Contexto do turno" do AGIR: o que o código já sabe e já decidiu, em texto para o modelo.
// Vai depois do prompt fixo. Ids nunca entram aqui: só nome, área e códigos de chamado.

export interface TurnBriefingInput {
  now: number;
  employee: { name: string; department: string };
  understanding: Understanding;
  rollingSummary: string | null;
  /** Nota do analista ao devolver a conversa (§5.11). */
  returnNote: string | null;
  /** Retomada depois de 12 horas (§8 F6). */
  returnContext: string | null;
  pendingDraft: { draftNumber: number; action: PendingAction } | null;
  focusedTicket: TicketSummary | null;
  ambiguousCandidates: TicketSummary[];
  /** `null` quando o turno não consultou os chamados. */
  employeeTickets: TicketSummary[] | null;
  guidingActions: GuidingAction[];
  /** Explicação da OverdueTicketPolicy, quando ela mandou oferecer analista. */
  overdueExplanation: string | null;
  /** Artigos da central já consultados pelo pipeline; `null` = não consultou. */
  articles: ArticleForModel[] | null;
  /** O aviso de dado sensível já foi escrito no começo da resposta. */
  sensitiveNoticeWritten: boolean;
}

export function buildTurnBriefing(input: TurnBriefingInput): string {
  const sections = [
    section("Funcionário", [`${input.employee.name}, área ${input.employee.department}.`]),
    section("Agora", [formatNow(input.now)]),
    section("O que o funcionário quer (etapa ENTENDER)", understandingLines(input.understanding)),
    input.rollingSummary ? section("Resumo da conversa até aqui", [input.rollingSummary]) : null,
    input.returnNote
      ? section("Nota do analista ao devolver a conversa", [input.returnNote])
      : null,
    input.returnContext ? section("Retomada", [input.returnContext]) : null,
    input.pendingDraft ? section("Rascunho pendente", [describeDraft(input.pendingDraft)]) : null,
    input.articles
      ? section("Central de ajuda (já consultada; siga o whatToDo)", articleLines(input.articles))
      : null,
    section("Chamados", ticketLines(input)),
    section("Decisões já tomadas em código (siga)", decisionLines(input)),
  ];
  return `Contexto do turno\n\n${sections.filter((text) => text !== null).join("\n\n")}`;
}

function section(title: string, lines: string[]): string {
  return `## ${title}\n${lines.join("\n")}`;
}

function formatNow(now: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
}

function understandingLines(understanding: Understanding): string[] {
  const known = (record: object) =>
    Object.entries(record)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join("; ") || "nada";
  return [
    `Intenção: ${understanding.intent}. ${understanding.summary}`,
    `Entidades: ${known(understanding.entities)}.`,
    `Sinais: ${known(understanding.ticketSignals)}.`,
    understanding.missingFields.length > 0
      ? `Falta saber: ${understanding.missingFields.join(", ")}.`
      : "Não falta informação.",
  ];
}

function describeDraft(draft: { draftNumber: number; action: PendingAction }): string {
  const { action } = draft;
  switch (action.kind) {
    case "create_ticket":
      return `D-${draft.draftNumber}: abrir chamado "${action.ticket.title}", aguardando o funcionário confirmar no card.`;
    case "update_ticket":
      return `D-${draft.draftNumber}: atualizar o ${action.code}, aguardando o funcionário confirmar no card.`;
    case "reopen_ticket":
      return `D-${draft.draftNumber}: reabrir o ${action.code}, aguardando o funcionário confirmar no card.`;
  }
}

function articleLines(articles: ArticleForModel[]): string[] {
  if (articles.length === 0)
    return ["Nenhum artigo encontrado: siga para o chamado se for um problema."];
  return articles.map(
    (article, index) =>
      `${index + 1}. "${article.title}" (${article.applicability}). whatToDo: ${article.whatToDo}\n   Conteúdo: ${article.body}`,
  );
}

function ticketLines(input: TurnBriefingInput): string[] {
  if (input.employeeTickets === null) {
    return ["Ainda não consultados neste turno (use listMyTickets se precisar)."];
  }
  const lines = [
    input.employeeTickets.length === 0
      ? "O funcionário não tem chamados."
      : `Chamados do funcionário:\n${input.employeeTickets.map((ticket) => `- ${ticketLine(ticket, input.now)}`).join("\n")}`,
  ];
  if (input.focusedTicket) {
    lines.push(`Chamado em foco: ${input.focusedTicket.code}.`);
  } else if (input.ambiguousCandidates.length > 1) {
    const codes = input.ambiguousCandidates.map((ticket) => ticket.code).join(", ");
    lines.push(
      `Mais de um chamado combina com o que ele disse (${codes}): use showTicketSelector.`,
    );
  } else if (input.understanding.entities.ticketRef) {
    lines.push(
      `Nenhum chamado do funcionário combina com "${input.understanding.entities.ticketRef}". Diga que não encontrou entre os dele (sem repetir códigos) e ofereça abrir um chamado.`,
    );
  }
  return lines;
}

function decisionLines(input: TurnBriefingInput): string[] {
  const lines = input.guidingActions.map((action) => guidingLine(action, input));
  const known = knownSignalsLine(input.understanding);
  if (known) lines.push(known);
  if (input.sensitiveNoticeWritten) {
    lines.push("O aviso sobre a senha removida já foi escrito no começo da resposta; não repita.");
  }
  return lines.length > 0 ? lines : ["Nenhuma política disparou: atenda normalmente."];
}

/** Impacto e bloqueio já ditos: perguntar de novo é falha de condução (§8 F4). */
function knownSignalsLine(understanding: Understanding): string | null {
  const { impact, blocked, deadlineToday } = understanding.ticketSignals;
  if (impact === null || blocked === null) return null;
  const urgency =
    deadlineToday === null ? "" : `, compromisso hoje: ${deadlineToday ? "sim" : "não"}`;
  return `Impacto (${impact}), bloqueio (${blocked ? "sim" : "não"})${urgency} já informados: NÃO pergunte isso de novo. Se for abrir chamado, siga direto para findSimilarTickets e a proposta neste turno.`;
}

function guidingLine(action: GuidingAction, input: TurnBriefingInput): string {
  if (action.kind === "ask_clarification") {
    return 'Confiança baixa ou média: faça UMA pergunta curta de esclarecimento e chame offerQuickReplies com respostas possíveis (ex.: "Com o que é o problema?" e as opções "Computador", "Internet ou VPN", "Acesso ou senha", "E-mail"). Não proponha rascunho neste turno.';
  }
  if (action.reason === "critical") {
    return "CASO CRÍTICO (CriticalPolicy): proponha o rascunho já neste turno (findSimilarTickets e depois proposeTicketDraft), sem perguntar urgência. Diga que, ao confirmar, um analista é chamado na hora.";
  }
  if (action.reason === "overdue") {
    return `CHAMADO VENCIDO (OverdueTicketPolicy): ${input.overdueExplanation ?? ""} Diga claramente que está vencido, explique o prazo com esses dados e pergunte se quer que chame um analista. O card do chamado e as opções de resposta já entram sozinhos; não chame requestHandoff nem offerQuickReplies.`;
  }
  return `Ofereça falar com um analista (${action.reason}).`;
}
