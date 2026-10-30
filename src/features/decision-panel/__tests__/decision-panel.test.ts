import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { DecisionRecord } from "@/domain/decision-record";
import { theme } from "@/shared/theme/theme";

import { DECISION_PANEL_SECTIONS, DecisionPanel } from "../decision-panel";
import {
  criticalDraftDecision,
  explicitHandoffDecision,
  modelFailureDecision,
  overdueTicketDecision,
  unstableLegacyDecision,
} from "../fixtures";

// Sem Testing Library no projeto: o painel é renderizado em HTML estático e conferido como texto.

function render(record: DecisionRecord): string {
  return renderToStaticMarkup(
    createElement(MantineProvider, { theme }, createElement(DecisionPanel, { record })),
  );
}

function sectionOrder(html: string): string[] {
  return [...html.matchAll(/data-section="([a-z]+)"/g)].map((match) => match[1]);
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

const EXPECTED_ORDER = DECISION_PANEL_SECTIONS.map((section) => section.id);

describe("DecisionPanel", () => {
  test("as 7 seções aparecem na ordem da §7.3", () => {
    expect(EXPECTED_ORDER).toEqual([
      "understanding",
      "policies",
      "actions",
      "priority",
      "confidence",
      "rationale",
      "usage",
    ]);
    for (const record of [criticalDraftDecision, explicitHandoffDecision, modelFailureDecision]) {
      expect(sectionOrder(render(record))).toEqual(EXPECTED_ORDER);
    }
  });

  test("registro completo: entendimento, regra que disparou, tentativas, prioridade e custo", () => {
    const text = textOf(render(criticalDraftDecision));
    expect(text).toContain("Abrir um chamado");
    expect(text).toContain("Sistema de vendas");
    expect(text).toContain("Caso crítico: disparou .");
    expect(text).toContain("Chamado vencido: não se aplica");
    expect(text).toContain("Procurou chamados parecidos");
    expect(text).toContain("funcionou de primeira");
    expect(text).toContain("Crítica: parado para uma equipe/empresa. Prazo: 1 hora corrida.");
    expect(text).toContain("1 hora corrida, até 29/10 às 15:23");
    expect(text).toContain("0,88");
    expect(text).toContain("US$ 0,0008");
    expect(text).toContain("4.180 tokens de entrada");
    expect(text).toContain("ver JSON");
  });

  test("explica a política de chamado vencido e a nova tentativa", () => {
    const text = textOf(render(overdueTicketDecision));
    expect(text).toContain(
      "INC-20311 sem atualização há 6 dias; prazo da prioridade Média é de 3 dias úteis.",
    );
    expect(text).toContain("tentativa 2 de 3 funcionou");
    expect(text).toContain("Não se aplica: este turno não classificou nenhum chamado.");
  });

  test("legado instável: a ferramenta aparece como falha nas 3 tentativas", () => {
    const html = render(unstableLegacyDecision);
    expect(html).toContain('data-status="error"');
    expect(textOf(html)).toContain("falhou nas 3 tentativas");
    expect(textOf(html)).toContain("Turno com erro");
  });

  test("turno que falhou antes de entender: cada seção diz o que faltou, sem quebrar", () => {
    const text = textOf(render(modelFailureDecision));
    expect(text).toContain("Não cheguei a entender a mensagem");
    expect(text).toContain("Nenhuma regra foi avaliada neste turno.");
    expect(text).toContain("Não usei nenhuma ferramenta neste turno.");
    expect(text).toContain("Sem avaliação: o turno falhou antes de medir a segurança.");
    expect(text).toContain("US$ 0,00");
  });
});
