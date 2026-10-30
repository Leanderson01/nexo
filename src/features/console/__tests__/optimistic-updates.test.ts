import { describe, expect, test } from "vitest";

import type { TicketDetail } from "@/domain/ticket";
import {
  QUEUE_CHANGES,
  withAnalystMessage,
  withAssigned,
  withClosed,
  withQueueChange,
  withRead,
  withReturnedToAgent,
  withTicketSummaryStatus,
  withTicketUpdate,
  type ConsoleConversationData,
  type ConsoleMessage,
  type ConsoleQueue,
} from "../optimistic-updates";

type ConversationId = ConsoleConversationData["_id"];
const CONVERSATION_ID = "conv_1" as ConversationId;
const ANA = { name: "Ana Ribeiro", level: "N1" as const };

const CONVERSATION: ConsoleConversationData = {
  _id: CONVERSATION_ID,
  status: "waiting_analyst",
  subject: "VPN",
  employee: {
    _id: "person_1" as ConsoleConversationData["employee"]["_id"],
    name: "Mariana Costa",
    email: "mariana.costa@nexo.com.br",
    department: "Financeiro",
  },
  handoff: null,
  relatedTicketCode: null,
  assignedAnalyst: null,
  isMine: false,
  agentBusy: false,
  returnNote: null,
  analystReadAt: null,
  closedAt: null,
  summary: { articleTitles: [], clarifyingQuestions: 0, ticketCodes: [], agentConfidence: null },
};

describe("console: mensagem do analista", () => {
  test("entra no fim com o reloginho e o nome de quem escreveu", () => {
    const messages = withAnalystMessage([], {
      id: "optimistic:1" as ConsoleMessage["_id"],
      conversationId: CONVERSATION_ID,
      text: "  Já vou ver.  ",
      analyst: ANA,
      now: 10,
    });

    expect(messages).toEqual([
      expect.objectContaining({
        role: "analyst",
        parts: [{ type: "text", text: "Já vou ver." }],
        createdAt: 10,
        analyst: { name: "Ana Ribeiro", level: "N1" },
        receipt: "sending",
      }),
    ]);
  });
});

describe("console: estado da conversa", () => {
  test("assumir: com o analista, é minha e lida até agora", () => {
    expect(withAssigned(CONVERSATION, ANA, 50)).toMatchObject({
      status: "with_analyst",
      isMine: true,
      assignedAnalyst: { name: "Ana Ribeiro", level: "N1" },
      analystReadAt: 50,
    });
  });

  test("assumir só vale de `waiting_analyst`", () => {
    const withAgent = { ...CONVERSATION, status: "agent" as const };
    expect(withAssigned(withAgent, ANA, 50)).toBe(withAgent);
  });

  test("devolver: volta ao agent, sem analista", () => {
    const mine = withAssigned(CONVERSATION, ANA, 50);
    expect(withReturnedToAgent(mine)).toMatchObject({
      status: "agent",
      isMine: false,
      assignedAnalyst: null,
    });
  });

  test("encerrar: encerrada e sem ninguém atendendo", () => {
    expect(withClosed(withAssigned(CONVERSATION, ANA, 50), 60)).toMatchObject({
      status: "closed",
      isMine: false,
      assignedAnalyst: null,
      closedAt: 60,
    });
  });

  test("marcar como lida", () => {
    expect(withRead(CONVERSATION, 70).analystReadAt).toBe(70);
  });
});

describe("console: fila", () => {
  const queue = {
    items: [
      { _id: CONVERSATION_ID, status: "waiting_analyst", isMine: false, unread: 2 },
      { _id: "conv_2" as ConversationId, status: "waiting_analyst", isMine: false, unread: 1 },
    ],
    counts: { all: 2, for_you: 2, with_agent: 0, mine: 0, closed: 0 },
    undelivered: [],
  } as unknown as ConsoleQueue;

  test("só o item da conversa muda", () => {
    const changed = withQueueChange(queue, "conv_1", QUEUE_CHANGES.assigned(ANA));
    expect(changed.items[0]).toMatchObject({
      status: "with_analyst",
      isMine: true,
      assignedAnalystName: "Ana Ribeiro",
      unread: 0,
    });
    expect(changed.items[1]).toBe(queue.items[1]);
  });

  test("lida zera o contador", () => {
    expect(withQueueChange(queue, "conv_1", QUEUE_CHANGES.read).items[0]?.unread).toBe(0);
  });
});

describe("console: Registrar atualização", () => {
  const ticket = {
    code: "INC-1",
    status: "in_progress",
    lastActivityAt: 1,
    updates: [],
  } as unknown as TicketDetail;

  test("a atualização entra no histórico, com o status novo", () => {
    const updated = withTicketUpdate(ticket, {
      text: " Troquei o cabo. ",
      status: "resolved",
      analystName: "Ana Ribeiro",
      now: 90,
    });
    expect(updated.status).toBe("resolved");
    expect(updated.updates).toEqual([
      {
        authorType: "analyst",
        authorName: "Ana Ribeiro",
        text: "Troquei o cabo.",
        fieldChanges: { status: "resolved" },
        createdAt: 90,
      },
    ]);
  });

  test("sem status novo, o status fica", () => {
    const updated = withTicketUpdate(ticket, { text: "Ok", analystName: null, now: 90 });
    expect(updated.status).toBe("in_progress");
    expect(updated.updates[0]?.fieldChanges).toBeUndefined();
  });

  test("a lista do painel mostra o status novo", () => {
    const list = withTicketSummaryStatus(
      [ticket, { ...ticket, code: "INC-2" }],
      "INC-1",
      "resolved",
      90,
    );
    expect(list.map((item) => item.status)).toEqual(["resolved", "in_progress"]);
  });
});
