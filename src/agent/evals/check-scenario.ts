import type { MessagePart } from "@/domain/message-parts";
import type { TicketCode } from "@/domain/ticket";

import type {
  CreatedTicketExpectation,
  FinalStateExpectation,
  ObservedFinalState,
  ObservedReply,
  ObservedScenario,
  ObservedStep,
  ObservedTicket,
  PartExpectation,
  ProposedActionExpectation,
  Scenario,
  ScenarioStep,
  TextRule,
  TurnExpectation,
} from "./scenario";

// Verificador puro: compara as expectativas de um cenário com o que o runner observou
// e devolve as falhas em português. Lista vazia = cenário aprovado.

export function checkScenario(scenario: Scenario, observed: ObservedScenario): string[] {
  const failures: string[] = [];
  if (observed.steps.length !== scenario.steps.length) {
    failures.push(
      `O roteiro tem ${scenario.steps.length} passos, mas foram observados ${observed.steps.length}.`,
    );
  }
  scenario.steps.forEach((step, index) => {
    const prefix = `Passo ${index + 1} (${describeStep(step)})`;
    const current = observed.steps[index];
    if (!current) return;
    const previous = observed.steps[index - 1];
    failures.push(
      ...checkQuickReplyWasOffered(step, previous?.reply ?? null).map(withPrefix(prefix)),
    );
    if (step.kind === "message" && step.expect) {
      failures.push(...checkTurn(step.expect, current).map(withPrefix(prefix)));
    }
  });
  failures.push(...checkFinalState(scenario.final, observed.final).map(withPrefix("Estado final")));
  return failures;
}

function describeStep(step: ScenarioStep): string {
  if (step.kind === "confirmDraft") return "clica em Confirmar";
  if (step.kind === "cancelDraft") return "clica em Cancelar";
  return step.via === "quickReply" ? `escolhe "${step.text}"` : `"${step.text}"`;
}

function withPrefix(prefix: string): (failure: string) => string {
  return (failure) => `${prefix}: ${failure}`;
}

function checkQuickReplyWasOffered(step: ScenarioStep, previous: ObservedReply | null): string[] {
  if (step.kind !== "message" || step.via !== "quickReply") return [];
  const offered = previous?.parts.some((part) => partMatches(part, quickReply(step.text)));
  return offered ? [] : [`a resposta anterior não ofereceu a opção rápida "${step.text}".`];
}

function quickReply(label: string): PartExpectation {
  return { type: "quickReplies", includesLabel: label };
}

// ---------- Turno ----------

function checkTurn(expect: TurnExpectation, observed: ObservedStep): string[] {
  const failures: string[] = [];
  const decision = observed.decision;
  const reply = observed.reply;

  if (needsDecision(expect) && !decision) {
    failures.push("nenhum DecisionRecord foi registrado para o turno.");
  }
  if (decision) {
    failures.push(...checkOneOf("outcome", expect.outcome, decision.outcome));
    failures.push(...checkOneOf("intenção", expect.intent, decision.understanding?.intent));
    if (expect.confidenceLevel && decision.confidence?.level !== expect.confidenceLevel) {
      failures.push(
        `nível de confiança: esperado "${expect.confidenceLevel}", observado "${decision.confidence?.level ?? "nenhum"}".`,
      );
    }
    failures.push(...checkPolicies(expect, decision.policies));
    failures.push(...checkTools(expect, decision.actions));
    if (expect.priority && decision.derived?.priority?.value !== expect.priority) {
      failures.push(
        `prioridade derivada: esperado "${expect.priority}", observado "${decision.derived?.priority?.value ?? "nenhuma"}".`,
      );
    }
  }

  if (needsReply(expect) && !reply) {
    failures.push("nenhuma resposta do assistente foi observada.");
  }
  if (reply) {
    failures.push(...checkParts(expect, reply.parts));
    failures.push(
      ...checkTextRules(expect.text?.mustMatch, expect.text?.mustNotMatch, reply.text, "o texto"),
    );
  }

  if (expect.mustNotExpose) {
    const outputs = decision?.actions.map((action) => action.outputSummary) ?? [];
    failures.push(...checkNotExposed(expect.mustNotExpose, reply, outputs));
  }
  return failures;
}

function needsDecision(expect: TurnExpectation): boolean {
  return (
    expect.outcome !== undefined ||
    expect.intent !== undefined ||
    expect.confidenceLevel !== undefined ||
    expect.policiesTriggered !== undefined ||
    expect.policiesNotTriggered !== undefined ||
    expect.toolsCalled !== undefined ||
    expect.toolsForbidden !== undefined ||
    expect.noToolCalls !== undefined ||
    expect.priority !== undefined
  );
}

function needsReply(expect: TurnExpectation): boolean {
  return expect.parts !== undefined || expect.text !== undefined;
}

function checkOneOf<T extends string>(
  label: string,
  expected: T | T[] | undefined,
  observed: T | undefined,
): string[] {
  if (expected === undefined) return [];
  const accepted = Array.isArray(expected) ? expected : [expected];
  if (observed !== undefined && accepted.includes(observed)) return [];
  const list = accepted.map((value) => `"${value}"`).join(" ou ");
  return [`${label}: esperado ${list}, observado "${observed ?? "nenhum"}".`];
}

function checkPolicies(
  expect: TurnExpectation,
  policies: { name: string; outcome: string }[],
): string[] {
  const failures: string[] = [];
  const triggered = new Set(policies.filter((p) => p.outcome === "triggered").map((p) => p.name));
  for (const name of expect.policiesTriggered ?? []) {
    if (!triggered.has(name))
      failures.push(`a política ${name} deveria ter disparado e não disparou.`);
  }
  for (const name of expect.policiesNotTriggered ?? []) {
    if (triggered.has(name)) failures.push(`a política ${name} não deveria ter disparado.`);
  }
  return failures;
}

function checkTools(
  expect: TurnExpectation,
  actions: { tool: string; status: string; attempts: number }[],
): string[] {
  const failures: string[] = [];
  for (const wanted of expect.toolsCalled ?? []) {
    const calls = actions.filter((action) => action.tool === wanted.tool);
    if (calls.length === 0) {
      failures.push(`a tool ${wanted.tool} deveria ter sido chamada e não foi.`);
      continue;
    }
    const matches = calls.some(
      (call) =>
        (wanted.status === undefined || call.status === wanted.status) &&
        (wanted.attempts === undefined || call.attempts === wanted.attempts),
    );
    if (!matches) {
      const seen = calls
        .map((c) => `status "${c.status}" com ${c.attempts} tentativa(s)`)
        .join("; ");
      failures.push(
        `a tool ${wanted.tool} foi chamada, mas não como esperado (${describeToolCall(wanted)}); observado: ${seen}.`,
      );
    }
  }
  for (const forbidden of expect.toolsForbidden ?? []) {
    if (actions.some((action) => action.tool === forbidden)) {
      failures.push(`a tool ${forbidden} não pode ser chamada neste turno.`);
    }
  }
  if (expect.noToolCalls && actions.length > 0) {
    const tools = actions.map((action) => action.tool).join(", ");
    failures.push(`o turno deveria curto-circuitar sem chamar tools, mas chamou: ${tools}.`);
  }
  return failures;
}

function describeToolCall(wanted: { status?: string; attempts?: number }): string {
  const details: string[] = [];
  if (wanted.status) details.push(`status "${wanted.status}"`);
  if (wanted.attempts !== undefined) details.push(`${wanted.attempts} tentativa(s)`);
  return details.join(" com ");
}

// ---------- Partes e texto ----------

function checkParts(expect: TurnExpectation, parts: MessagePart[]): string[] {
  const failures: string[] = [];
  for (const wanted of expect.parts?.mustInclude ?? []) {
    if (!parts.some((part) => partMatches(part, wanted))) {
      failures.push(`a resposta deveria ter ${describePart(wanted)}.`);
    }
  }
  for (const unwanted of expect.parts?.mustNotInclude ?? []) {
    if (parts.some((part) => partMatches(part, unwanted))) {
      failures.push(`a resposta não pode ter ${describePart(unwanted)}.`);
    }
  }
  return failures;
}

function partMatches(part: MessagePart, wanted: PartExpectation): boolean {
  switch (wanted.type) {
    case "article":
      return part.type === "article" && (wanted.slug === undefined || part.slug === wanted.slug);
    case "ticket":
      return part.type === "ticket" && (wanted.code === undefined || part.code === wanted.code);
    case "ticketSelector":
      return (
        part.type === "ticketSelector" &&
        (wanted.includesCodes ?? []).every((code) => part.codes.includes(code))
      );
    case "draft":
      return part.type === "draft";
    case "quickReplies":
      return part.type === "quickReplies" && hasOption(part.options, wanted.includesLabel);
    case "handoff":
      return (
        part.type === "handoff" && (wanted.reason === undefined || part.reason === wanted.reason)
      );
    case "error":
      return (
        part.type === "error" &&
        (wanted.retryable === undefined || part.retryable === wanted.retryable)
      );
  }
}

function hasOption(options: { label: string }[], label: string | undefined): boolean {
  if (label === undefined) return true;
  const wanted = label.toLocaleLowerCase("pt-BR");
  return options.some((option) => option.label.toLocaleLowerCase("pt-BR").includes(wanted));
}

function describePart(wanted: PartExpectation): string {
  switch (wanted.type) {
    case "article":
      return wanted.slug ? `o card do artigo "${wanted.slug}"` : "um card de artigo";
    case "ticket":
      return wanted.code ? `o card do chamado ${wanted.code}` : "um card de chamado";
    case "ticketSelector":
      return wanted.includesCodes?.length
        ? `o seletor de chamados com ${wanted.includesCodes.join(", ")}`
        : "o seletor de chamados";
    case "draft":
      return "um card de rascunho";
    case "quickReplies":
      return wanted.includesLabel ? `a opção rápida "${wanted.includesLabel}"` : "opções rápidas";
    case "handoff":
      return wanted.reason
        ? `o banner de transferência com motivo "${wanted.reason}"`
        : "o banner de transferência";
    case "error":
      return wanted.retryable === undefined
        ? "uma mensagem de erro"
        : `uma mensagem de erro ${wanted.retryable ? "com" : "sem"} "Tentar de novo"`;
  }
}

function checkTextRules(
  mustMatch: TextRule[] | undefined,
  mustNotMatch: TextRule[] | undefined,
  text: string,
  subject: string,
): string[] {
  const failures: string[] = [];
  for (const rule of mustMatch ?? []) {
    if (!findMatch(rule, text)) {
      failures.push(
        `${subject} deveria: ${rule.description} (padrão ${rule.pattern} não encontrado).`,
      );
    }
  }
  for (const rule of mustNotMatch ?? []) {
    const found = findMatch(rule, text);
    if (found) {
      failures.push(`${subject} não pode: ${rule.description} (encontrado "${found}").`);
    }
  }
  return failures;
}

/** Sem a flag `g`, para o resultado não depender de buscas anteriores com o mesmo RegExp. */
function findMatch(rule: TextRule, text: string): string | null {
  const pattern = new RegExp(rule.pattern.source, rule.pattern.flags.replace("g", ""));
  return text.match(pattern)?.[0] ?? null;
}

function checkNotExposed(
  codes: TicketCode[],
  reply: ObservedReply | null,
  toolOutputs: string[],
): string[] {
  const failures: string[] = [];
  for (const code of codes) {
    if (reply?.text.includes(code)) failures.push(`o texto expõe o chamado ${code}.`);
    if (reply?.parts.some((part) => partMentions(part, code))) {
      failures.push(`as partes da resposta expõem o chamado ${code}.`);
    }
    if (toolOutputs.some((output) => output.includes(code))) {
      failures.push(`a saída de uma tool expõe o chamado ${code}.`);
    }
  }
  return failures;
}

function partMentions(part: MessagePart, code: TicketCode): boolean {
  if (part.type === "ticket") return part.code === code;
  if (part.type === "ticketSelector") return part.codes.includes(code);
  if (part.type === "text") return part.text.includes(code);
  return false;
}

// ---------- Estado final ----------

function checkFinalState(expect: FinalStateExpectation, observed: ObservedFinalState): string[] {
  const failures: string[] = [];
  if (expect.conversationStatus && observed.conversationStatus !== expect.conversationStatus) {
    failures.push(
      `status da conversa: esperado "${expect.conversationStatus}", observado "${observed.conversationStatus}".`,
    );
  }
  if (expect.handoffReason !== undefined && observed.handoffReason !== expect.handoffReason) {
    failures.push(
      expect.handoffReason === null
        ? `a conversa não deveria ter sido transferida, mas foi (motivo "${observed.handoffReason}").`
        : `motivo da transferência: esperado "${expect.handoffReason}", observado "${observed.handoffReason ?? "nenhum"}".`,
    );
  }
  if (expect.proposedAction !== undefined) {
    failures.push(...checkProposedAction(expect.proposedAction, observed.proposedAction));
  }
  if (expect.ticketsCreated) {
    failures.push(...checkCreatedTickets(expect.ticketsCreated, observed.ticketsCreated));
  }
  for (const stored of observed.storedTexts) {
    failures.push(
      ...checkTextRules(undefined, expect.storedDataMustNotMatch, stored, "o que foi gravado"),
    );
  }
  return failures;
}

function checkProposedAction(
  expect: ProposedActionExpectation | null,
  observed: ObservedFinalState["proposedAction"],
): string[] {
  if (expect === null) {
    return observed
      ? [`nenhum rascunho deveria ter sido proposto, mas há um "${observed.action.kind}".`]
      : [];
  }
  if (!observed) return [`deveria haver um rascunho "${expect.kind}", mas nenhum foi proposto.`];
  if (observed.action.kind !== expect.kind) {
    return [`tipo de rascunho: esperado "${expect.kind}", observado "${observed.action.kind}".`];
  }
  const failures: string[] = [];
  if (expect.status && observed.status !== expect.status) {
    failures.push(
      `status do rascunho: esperado "${expect.status}", observado "${observed.status}".`,
    );
  }
  const action = observed.action;
  if (expect.kind === "create_ticket" && action.kind === "create_ticket") {
    const ticket = action.ticket;
    failures.push(...compareField("tipo do chamado no rascunho", expect.ticketKind, ticket.kind));
    failures.push(...compareField("categoria do rascunho", expect.category, ticket.category));
    failures.push(...compareField("prioridade do rascunho", expect.priority, ticket.priority));
    failures.push(...compareReference("o rascunho", expect.reopenedFrom, ticket.reopenedFrom));
    failures.push(
      ...checkTextRules(
        expect.descriptionMustMatch,
        undefined,
        ticket.description,
        "a descrição do rascunho",
      ),
    );
  }
  if (expect.kind !== "create_ticket" && action.kind !== "create_ticket") {
    failures.push(...compareField("chamado do rascunho", expect.code, action.code));
  }
  return failures;
}

function checkCreatedTickets(
  expected: CreatedTicketExpectation[],
  observed: ObservedTicket[],
): string[] {
  if (expected.length !== observed.length) {
    const codes = observed.map((ticket) => ticket.code).join(", ");
    return [
      `esperava ${expected.length} chamado(s) criado(s), observado ${observed.length}${codes ? ` (${codes})` : ""}.`,
    ];
  }
  return expected.flatMap((expect, index) => {
    const ticket = observed[index];
    const label = `chamado criado ${ticket.code}`;
    return [
      ...compareField(`tipo do ${label}`, expect.kind, ticket.kind),
      ...compareField(`categoria do ${label}`, expect.category, ticket.category),
      ...compareField(`prioridade do ${label}`, expect.priority, ticket.priority),
      ...compareReference(`o ${label}`, expect.reopenedFrom, ticket.reopenedFrom),
    ];
  });
}

function compareField<T extends string>(
  label: string,
  expected: T | undefined,
  observed: T,
): string[] {
  if (expected === undefined || expected === observed) return [];
  return [`${label}: esperado "${expected}", observado "${observed}".`];
}

function compareReference(
  subject: string,
  expected: TicketCode | null | undefined,
  observed: TicketCode | undefined,
): string[] {
  if (expected === undefined || expected === (observed ?? null)) return [];
  if (expected === null)
    return [`${subject} não deveria referenciar chamado antigo, mas cita ${observed}.`];
  return [
    `${subject} deveria referenciar ${expected}, mas ${observed ? `cita ${observed}` : "não cita nenhum"}.`,
  ];
}
