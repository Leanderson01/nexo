import type { MessagePart } from "@/domain/message-parts";

import type { ObservedStep, ScenarioStep } from "./scenario";

// Puro: a conversa de um cenário em texto, para entender uma falha sem abrir o app.
// Aparece no terminal e no Markdown só para os cenários que falharam.

export function transcriptLines(step: ScenarioStep, observed: ObservedStep | undefined): string[] {
  const lines = [describeAction(step)];
  const reply = observed?.reply;
  if (!reply) return [...lines, "Assistente: (nenhuma resposta)"];
  if (reply.text) lines.push(`Assistente: ${oneLine(reply.text)}`);
  const parts = reply.parts.filter((part) => part.type !== "text").map(describePart);
  if (parts.length > 0) lines.push(`  [${parts.join("; ")}]`);
  if (observed.decision) {
    const { outcome, understanding, confidence } = observed.decision;
    lines.push(
      `  (outcome ${outcome}, intenção ${understanding?.intent ?? "nenhuma"}, confiança ${confidence?.level ?? "nenhuma"})`,
    );
  }
  return lines;
}

function describeAction(step: ScenarioStep): string {
  if (step.kind === "confirmDraft") return "Funcionário: [clica em Confirmar]";
  if (step.kind === "cancelDraft") return "Funcionário: [clica em Cancelar]";
  if (step.kind === "returnToAgent")
    return `Analista: [devolve ao agent com a nota "${step.note}"]`;
  return step.via === "quickReply"
    ? `Funcionário: [escolhe "${step.text}"]`
    : `Funcionário: ${step.text}`;
}

export function describePart(part: MessagePart): string {
  switch (part.type) {
    case "text":
      return "texto";
    case "article":
      return `artigo ${part.slug}`;
    case "ticket":
      return `chamado ${part.code}`;
    case "ticketSelector":
      return `seletor ${part.codes.join(", ")}`;
    case "draft":
      return "rascunho";
    case "quickReplies":
      return `opções: ${part.options.map((option) => option.label).join(" | ")}`;
    case "handoff":
      return `transferência (${part.reason})`;
    case "event":
      return `evento ${part.kind}`;
    case "error":
      return `erro${part.retryable ? " com Tentar de novo" : ""}`;
  }
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
