import { derivePriority } from "@/domain/priority";
import type { DerivedPriority } from "@/domain/ticket";
import type { TicketSignals } from "@/domain/understanding";

/**
 * Prioridade do `TurnContext`, derivada dos sinais que o ENTENDER extraiu da mensagem.
 *
 * Exige tipo, impacto e bloqueio: são eles que separam Crítica, Alta, Média e Baixa, e chutar
 * qualquer um deles poderia inventar criticidade. Sem eles, devolve `null` (a CriticalPolicy
 * fica "não se aplica" e o agent pergunta o que falta, §8 F4).
 *
 * Único padrão: urgência nula (`deadlineToday`) conta como "sem compromisso hoje". Isso só pode
 * baixar a prioridade (nunca a eleva a Alta nem a Crítica), e o agent ainda pergunta a urgência
 * antes do rascunho.
 */
export function deriveSignalsPriority(signals: TicketSignals): DerivedPriority | null {
  const { kind, impact, blocked, deadlineToday } = signals;
  if (kind === null || impact === null || blocked === null) return null;
  return derivePriority({ kind, impact, blocked, deadlineToday: deadlineToday ?? false });
}
