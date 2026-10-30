import { describe, expect, it } from "vitest";

import { makeUnderstanding } from "@/agent/policies/__tests__/fixtures";
import { toolsForIntent } from "@/agent/tools/create-tools";
import type { TicketSummary } from "@/domain/ticket";

import { resolveFocus } from "../focus";
import { TurnWorkspace } from "../turn-workspace";
import { NOTEBOOK, SAP, WIFI } from "./fakes";

const TICKETS: TicketSummary[] = [NOTEBOOK, SAP, WIFI];

async function focusFor(
  userText: string,
  entities: Partial<ReturnType<typeof makeUnderstanding>["entities"]> = {},
) {
  const workspace = new TurnWorkspace();
  const understanding = makeUnderstanding({
    intent: "ticket_status",
    entities: { ...makeUnderstanding().entities, ...entities },
  });
  return resolveFocus({
    understanding,
    userText,
    selectedTicketCode: null,
    workspace,
    listEmployeeTickets: async () => {
      workspace.employeeTickets = TICKETS;
    },
  });
}

describe("resolveFocus: chamado sem dizer qual (QA R1, F2)", () => {
  it('"Qual o status do meu chamado?" com vários chamados: todos vão para o seletor', async () => {
    const result = await focusFor("Qual o status do meu chamado?", { ticketRef: null });
    expect(result.resolution.ambiguousCandidates.map((ticket) => ticket.code)).toEqual(
      TICKETS.map((ticket) => ticket.code),
    );
  });

  it("com o chamado descrito, não vira seletor de todos", async () => {
    const result = await focusFor("Como está o chamado da impressora do 2º andar?");
    expect(result.resolution.ambiguousCandidates).toEqual([]);
  });
});

describe("toolsForIntent", () => {
  it("consulta de status não tem as tools de proposta", () => {
    const tools = { a: 1, proposeTicketDraft: 2, proposeTicketUpdate: 3, proposeReopen: 4 };
    const asTools = tools as unknown as Parameters<typeof toolsForIntent>[0];
    expect(Object.keys(toolsForIntent(asTools, "ticket_status"))).toEqual(["a"]);
    expect(toolsForIntent(asTools, "open_ticket")).toBe(asTools);
  });
});
