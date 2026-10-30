import { impersonal } from "@/domain/ticket-classification";
import { groundedSentence, problemStatement } from "@/domain/ticket-description";

import type { ToolSession } from "./tool-session";

/**
 * Texto da atualização ou da reabertura (§11.2) sem fato inventado: a frase do modelo, se ela
 * reescreve o trecho citado do funcionário; senão o próprio trecho; senão a mensagem em que ele
 * contou o problema. Na validação saía "Já tentei desbloquear conforme orientações anteriores".
 */
export function groundedDraftText(text: string, evidence: string, session: ToolSession): string {
  const { employeeTexts } = session.facts;
  const result = groundedSentence({ text, evidence }, employeeTexts);
  if (result.replaced) session.workspace.correctedDescriptionFields.push("texto do rascunho");
  if (result.sentence) return impersonal(result.sentence);
  const problem = problemStatement(
    employeeTexts,
    session.understanding.summary,
    session.facts.quickReplyAnswers,
  );
  return impersonal(problem.trim());
}
