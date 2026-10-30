import { derivePriority } from "@/domain/priority";
import type { DerivedPriority } from "@/domain/ticket";
import type { TicketSignals } from "@/domain/understanding";

/**
 * Prioridade do `TurnContext`, derivada dos sinais que o ENTENDER extraiu da mensagem.
 *
 * Exige impacto e bloqueio: são eles que separam Crítica e Alta do resto, e chutar qualquer um
 * poderia inventar criticidade. Sem eles, devolve `null` (a CriticalPolicy fica "não se aplica"
 * e o agent pergunta o que falta, §8 F4).
 *
 * O tipo (INC/REQ) só decide entre Média e Baixa. Por isso, com o tipo nulo, Crítica e Alta
 * continuam sendo derivadas ("o sistema caiu para o time todo" é Crítica mesmo sem o modelo
 * dizer que é incidente); só quando o resultado dependeria do tipo é que devolve `null`
 * (TASKS.md, decisão 21).
 *
 * Único padrão: urgência nula (`deadlineToday`) conta como "sem compromisso hoje". Isso só pode
 * baixar a prioridade (nunca a eleva a Alta nem a Crítica), e o agent ainda pergunta a urgência
 * antes do rascunho.
 */
export function deriveSignalsPriority(signals: TicketSignals): DerivedPriority | null {
  const { kind, impact, blocked } = signals;
  if (impact === null || blocked === null) return null;

  const deadlineToday = signals.deadlineToday ?? false;
  if (kind !== null) return derivePriority({ kind, impact, blocked, deadlineToday });

  // Sem o tipo: o cálculo com INC só serve se chegar a Crítica ou Alta, que independem do tipo.
  const withoutKind = derivePriority({ kind: "INC", impact, blocked, deadlineToday });
  const dependsOnKind = withoutKind.priority === "MEDIUM" || withoutKind.priority === "LOW";
  return dependsOnKind ? null : withoutKind;
}
