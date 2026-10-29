/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import type { NewTicket } from "../../src/domain/ticket";

// Serviço de chamados (convex/ticketing) contra a seed da T2. As internal queries e
// mutations são o que a API HTTP chama; as queries públicas são as leituras da UI.

const modules = import.meta.glob("../**/*.ts");

const DAY_MS = 24 * 60 * 60 * 1000;

type Test = TestConvex<typeof schema>;

const MARIANA = "mariana.costa@nexo.com.br";
const RAFAEL = "rafael.lima@nexo.com.br";

const excelTicket: NewTicket = {
  kind: "INC",
  category: "software",
  title: "Excel fecha sozinho",
  description: "O Excel fecha ao abrir planilhas grandes.",
  affected: "Somente você",
  prioritySignals: { impact: "individual", blocked: false, deadlineToday: false },
  priority: "MEDIUM",
  priorityReason: "Atrapalha, mas há alternativa",
};

async function seeded(): Promise<Test> {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  return t;
}

async function personId(t: Test, email: string): Promise<Id<"people">> {
  const person = await t.run((ctx) =>
    ctx.db
      .query("people")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique(),
  );
  if (!person) throw new Error(`Pessoa ${email} não está na seed.`);
  return person._id;
}

async function ticketDoc(t: Test, code: string) {
  const ticket = await t.run((ctx) =>
    ctx.db
      .query("tickets")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique(),
  );
  if (!ticket) throw new Error(`Chamado ${code} não existe.`);
  return ticket;
}

/** Cria o usuário do Convex Auth com o e-mail e devolve um cliente logado como ele. */
async function loginAs(t: Test, email: string) {
  const subject = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60_000,
    });
    return `${userId}|${sessionId}`;
  });
  return t.withIdentity({ subject });
}

describe("create", () => {
  test("gera códigos sequenciais por tipo a partir dos contadores", async () => {
    const t = await seeded();
    const mariana = await personId(t, MARIANA);
    const create = (ticket: NewTicket, key: string) =>
      t.mutation(internal.ticketing.service.create, {
        employeeId: mariana,
        ticket,
        idempotencyKey: key,
      });

    const first = await create(excelTicket, "k1");
    const second = await create(excelTicket, "k2");
    const request = await create({ ...excelTicket, kind: "REQ", priority: "LOW" }, "k3");

    expect(first.ok && first.value.code).toBe("INC-20421");
    expect(second.ok && second.value.code).toBe("INC-20422");
    expect(request.ok && request.value.code).toBe("REQ-10511");
  });

  test("sem contador, o primeiro código é 00001", async () => {
    const t = convexTest(schema, modules);
    const employeeId = await t.run((ctx) =>
      ctx.db.insert("people", {
        name: "Teste",
        email: "teste@nexo.com.br",
        role: "employee",
        department: "TI",
      }),
    );

    const result = await t.mutation(internal.ticketing.service.create, {
      employeeId,
      ticket: { ...excelTicket, kind: "REQ" },
      idempotencyKey: "k1",
    });

    expect(result.ok && result.value.code).toBe("REQ-00001");
  });

  test("abre com status Aberto, prazo contando da criação e o registro do agent", async () => {
    const t = await seeded();
    const mariana = await personId(t, MARIANA);

    const result = await t.mutation(internal.ticketing.service.create, {
      employeeId: mariana,
      ticket: excelTicket,
      idempotencyKey: "k1",
    });

    if (!result.ok) throw new Error("create falhou");
    expect(result.value.status).toBe("open");
    expect(result.value.lastActivityAt).toBe(result.value.createdAt);
    expect(result.value.updates).toHaveLength(1);
    expect(result.value.updates[0].authorType).toBe("agent");
  });

  test("a mesma chave devolve o chamado já criado, sem criar outro", async () => {
    const t = await seeded();
    const mariana = await personId(t, MARIANA);
    const args = { employeeId: mariana, ticket: excelTicket, idempotencyKey: "pending-1" };

    const first = await t.mutation(internal.ticketing.service.create, args);
    const second = await t.mutation(internal.ticketing.service.create, args);

    expect(second).toEqual(first);
    const created = await t.run((ctx) =>
      ctx.db
        .query("tickets")
        .withIndex("by_owner_status", (q) => q.eq("ownerId", mariana))
        .collect(),
    );
    expect(created.filter((ticket) => ticket.title === excelTicket.title)).toHaveLength(1);
  });

  test("a chave de outro funcionário devolve não encontrado, sem revelar o chamado", async () => {
    const t = await seeded();
    const mariana = await personId(t, MARIANA);
    const rafael = await personId(t, RAFAEL);
    await t.mutation(internal.ticketing.service.create, {
      employeeId: mariana,
      ticket: excelTicket,
      idempotencyKey: "pending-1",
    });

    const replay = await t.mutation(internal.ticketing.service.create, {
      employeeId: rafael,
      ticket: excelTicket,
      idempotencyKey: "pending-1",
    });

    expect(replay).toEqual({
      ok: false,
      error: { kind: "not_found", message: "Chamado não encontrado entre os seus." },
    });
  });
});

describe("privacidade", () => {
  test("internal query: chamado alheio e inexistente têm a mesma resposta", async () => {
    const t = await seeded();
    const mariana = await personId(t, MARIANA);

    const alien = await t.query(internal.ticketing.reads.getMine, {
      employeeId: mariana,
      code: "INC-20402", // do Rafael
    });
    const missing = await t.query(internal.ticketing.reads.getMine, {
      employeeId: mariana,
      code: "INC-99999",
    });

    expect(alien).toEqual({
      ok: false,
      error: { kind: "not_found", message: "Chamado não encontrado entre os seus." },
    });
    expect(alien).toEqual(missing);
  });

  test("escrita em chamado alheio responde como inexistente e não grava nada", async () => {
    const t = await seeded();
    const mariana = await personId(t, MARIANA);
    const before = await ticketDoc(t, "INC-20402");

    const update = (code: string, key: string) =>
      t.mutation(internal.ticketing.service.addUpdate, {
        employeeId: mariana,
        code,
        text: "Bisbilhotando",
        authorType: "employee",
        idempotencyKey: key,
      });
    const alien = await update("INC-20402", "k1");
    const missing = await update("INC-99999", "k2");

    expect(alien).toEqual(missing);
    expect(await ticketDoc(t, "INC-20402")).toEqual(before);
  });

  test("query reativa: devolve null para alheio e inexistente, e o detalhe para o dono", async () => {
    const t = await seeded();
    const mariana = await loginAs(t, MARIANA);

    expect(await mariana.query(api.ticketing.queries.getMine, { code: "INC-20402" })).toBeNull();
    expect(await mariana.query(api.ticketing.queries.getMine, { code: "INC-99999" })).toBeNull();

    const own = await mariana.query(api.ticketing.queries.getMine, { code: "INC-20311" });
    expect(own?.title).toBe("Notebook lento após atualização do Windows");
    expect(own?.updates.map((update) => update.authorType)).toEqual([
      "agent",
      "analyst",
      "employee",
    ]);
  });

  test("listMine reativa traz só os chamados do funcionário logado", async () => {
    const t = await seeded();
    const mariana = await loginAs(t, MARIANA);

    const all = await mariana.query(api.ticketing.queries.listMine, {});
    const open = await mariana.query(api.ticketing.queries.listMine, { onlyOpen: true });

    expect(all.map((ticket) => ticket.code).sort()).toEqual([
      "INC-20150",
      "INC-20311",
      "REQ-10442",
    ]);
    expect(open.map((ticket) => ticket.code).sort()).toEqual(["INC-20311", "REQ-10442"]);
  });

  test("employeeTickets é só para analista", async () => {
    const t = await seeded();
    const rafael = await personId(t, RAFAEL);

    const ana = await loginAs(t, "ana.ribeiro@nexo.com.br");
    const tickets = await ana.query(api.ticketing.queries.employeeTickets, { employeeId: rafael });
    expect(tickets.map((ticket) => ticket.code).sort()).toEqual(["INC-20077", "INC-20402"]);

    const mariana = await loginAs(t, MARIANA);
    await expect(
      mariana.query(api.ticketing.queries.employeeTickets, { employeeId: rafael }),
    ).rejects.toThrow("Acesso restrito a analistas.");
  });
});

describe("addUpdate", () => {
  test("atualização do funcionário entra no histórico mas não renova o prazo", async () => {
    const t = await seeded();
    const mariana = await personId(t, MARIANA);
    const before = await ticketDoc(t, "INC-20311");

    const result = await t.mutation(internal.ticketing.service.addUpdate, {
      employeeId: mariana,
      code: "INC-20311",
      text: "Agora travou de vez.",
      authorType: "employee",
      idempotencyKey: "k1",
    });

    if (!result.ok) throw new Error("addUpdate falhou");
    expect(result.value.lastActivityAt).toBe(before.lastActivityAt);
    expect(result.value.updates.at(-1)).toMatchObject({
      authorType: "employee",
      text: "Agora travou de vez.",
    });
  });

  test("atualização do analista renova o prazo", async () => {
    const t = await seeded();
    const mariana = await personId(t, MARIANA);
    const before = await ticketDoc(t, "INC-20311");

    const result = await t.mutation(internal.ticketing.service.addUpdate, {
      employeeId: mariana,
      code: "INC-20311",
      text: "Logs analisados, vou trocar o SSD.",
      authorType: "analyst",
      authorName: "Ana Ribeiro",
      idempotencyKey: "k1",
    });

    if (!result.ok) throw new Error("addUpdate falhou");
    expect(result.value.lastActivityAt).toBeGreaterThan(before.lastActivityAt);
  });

  test("funcionário não muda o status; prioridade pode mudar (F3)", async () => {
    const t = await seeded();
    const mariana = await personId(t, MARIANA);

    const statusChange = await t.mutation(internal.ticketing.service.addUpdate, {
      employeeId: mariana,
      code: "INC-20311",
      text: "Pode fechar.",
      fieldChanges: { status: "closed" },
      authorType: "employee",
      idempotencyKey: "k1",
    });
    expect(statusChange.ok === false && statusChange.error.kind).toBe("validation");

    const priorityChange = await t.mutation(internal.ticketing.service.addUpdate, {
      employeeId: mariana,
      code: "INC-20311",
      text: "Agora ninguém do time consegue trabalhar.",
      fieldChanges: { priority: "CRITICAL", priorityReason: "Parado para uma equipe/empresa" },
      authorType: "employee",
      idempotencyKey: "k2",
    });
    expect(priorityChange.ok && priorityChange.value.priority).toBe("CRITICAL");
  });

  test("fechar grava resolvedAt, e chamado fechado não recebe atualização", async () => {
    const t = await seeded();
    const mariana = await personId(t, MARIANA);

    const closed = await t.mutation(internal.ticketing.service.addUpdate, {
      employeeId: mariana,
      code: "INC-20311",
      text: "Sem retorno da funcionária, encerrando.",
      fieldChanges: { status: "closed" },
      authorType: "analyst",
      idempotencyKey: "k1",
    });
    expect(closed.ok && closed.value.resolvedAt).toEqual(expect.any(Number));

    const afterClosed = await t.mutation(internal.ticketing.service.addUpdate, {
      employeeId: mariana,
      code: "INC-20311",
      text: "Voltou a travar.",
      authorType: "employee",
      idempotencyKey: "k2",
    });
    expect(afterClosed.ok === false && afterClosed.error.kind).toBe("conflict");
  });

  test("fechar um resolvido mantém a data da resolução", async () => {
    const t = await seeded();
    const mariana = await personId(t, MARIANA);
    const resolved = await ticketDoc(t, "INC-20150");

    const closed = await t.mutation(internal.ticketing.service.addUpdate, {
      employeeId: mariana,
      code: "INC-20150",
      text: "Encerrado.",
      fieldChanges: { status: "closed" },
      authorType: "analyst",
      idempotencyKey: "k1",
    });

    expect(closed.ok && closed.value.resolvedAt).toBe(resolved.resolvedAt);
  });
});

describe("reopen", () => {
  test("resolvido há até 7 dias reabre e recomeça o prazo", async () => {
    const t = await seeded();
    const mariana = await personId(t, MARIANA);
    const before = await ticketDoc(t, "INC-20150"); // resolvido há 4 dias

    const result = await t.mutation(internal.ticketing.service.reopen, {
      employeeId: mariana,
      code: "INC-20150",
      reason: "A senha bloqueou de novo.",
      idempotencyKey: "k1",
    });

    if (!result.ok) throw new Error("reopen falhou");
    expect(result.value.status).toBe("open");
    expect(result.value.resolvedAt).toBeUndefined();
    expect(result.value.lastActivityAt).toBeGreaterThan(before.lastActivityAt);
    expect(result.value.updates.at(-1)).toMatchObject({
      authorType: "employee",
      text: "A senha bloqueou de novo.",
      fieldChanges: { status: "open" },
    });
  });

  test("resolvido há mais de 7 dias não reabre", async () => {
    const t = await seeded();
    const rafael = await personId(t, RAFAEL);

    const result = await t.mutation(internal.ticketing.service.reopen, {
      employeeId: rafael,
      code: "INC-20077", // resolvido há 10 dias
      reason: "O Wi-Fi voltou a cair.",
      idempotencyKey: "k1",
    });

    expect(result.ok === false && result.error.kind).toBe("conflict");
    expect((await ticketDoc(t, "INC-20077")).status).toBe("resolved");
  });

  test("o limite é de 7 dias corridos contados do resolvedAt", async () => {
    const t = await seeded();
    const mariana = await personId(t, MARIANA);
    const ticket = await ticketDoc(t, "INC-20150");
    await t.run((ctx) =>
      ctx.db.patch(ticket._id, { resolvedAt: Date.now() - 7 * DAY_MS - 60_000 }),
    );

    const result = await t.mutation(internal.ticketing.service.reopen, {
      employeeId: mariana,
      code: "INC-20150",
      reason: "De novo.",
      idempotencyKey: "k1",
    });

    expect(result.ok === false && result.error.kind).toBe("conflict");
  });
});

describe("markHandoff", () => {
  test("registra a nota e passa para o analista sem renovar o prazo", async () => {
    const t = await seeded();
    const mariana = await personId(t, MARIANA);
    const before = await ticketDoc(t, "REQ-10442");
    const args = {
      employeeId: mariana,
      code: "REQ-10442",
      conversationId: "conv-1",
      idempotencyKey: "handoff:conv-1:REQ-10442",
    };

    const first = await t.mutation(internal.ticketing.service.markHandoff, args);
    const second = await t.mutation(internal.ticketing.service.markHandoff, args);

    expect(first).toEqual({ ok: true, value: null });
    expect(second).toEqual({ ok: true, value: null });
    const after = await ticketDoc(t, "REQ-10442");
    expect(after.status).toBe("awaiting_analyst");
    expect(after.lastActivityAt).toBe(before.lastActivityAt);
    const updates = await t.query(internal.ticketing.reads.getMine, {
      employeeId: mariana,
      code: "REQ-10442",
    });
    const handoffNotes = updates.ok
      ? updates.value.updates.filter((update) => update.text.includes("transferida"))
      : [];
    expect(handoffNotes).toHaveLength(1);
  });

  test("sem chamado em foco não faz nada", async () => {
    const t = await seeded();
    const mariana = await personId(t, MARIANA);

    const result = await t.mutation(internal.ticketing.service.markHandoff, {
      employeeId: mariana,
      code: null,
      conversationId: "conv-1",
      idempotencyKey: "handoff:conv-1:sem-chamado",
    });

    expect(result).toEqual({ ok: true, value: null });
  });
});

describe("findSimilar", () => {
  test("só do próprio funcionário, abertos e encerrados há até 30 dias", async () => {
    const t = await seeded();
    const rafael = await personId(t, RAFAEL);
    const mariana = await personId(t, MARIANA);
    const now = Date.now();
    await t.run(async (ctx) => {
      const base = {
        kind: "INC" as const,
        category: "network_vpn" as const,
        priority: "MEDIUM" as const,
        priorityReason: "Atrapalha, mas há alternativa",
        prioritySignals: { impact: "individual" as const, blocked: false, deadlineToday: false },
        description: "O Wi-Fi cai toda hora.",
        affected: "Somente você",
      };
      // Do Rafael, mas fechado há 40 dias: fora da janela.
      await ctx.db.insert("tickets", {
        ...base,
        code: "INC-10001",
        title: "Wi-Fi caindo no andar 2",
        status: "closed",
        ownerId: rafael,
        createdAt: now - 45 * DAY_MS,
        lastActivityAt: now - 40 * DAY_MS,
        resolvedAt: now - 40 * DAY_MS,
      });
      // Da Mariana, aberto e parecido: não é do Rafael.
      await ctx.db.insert("tickets", {
        ...base,
        code: "INC-10002",
        title: "Wi-Fi caindo na sala de reunião",
        status: "open",
        ownerId: mariana,
        createdAt: now,
        lastActivityAt: now,
      });
    });

    const result = await t.query(internal.ticketing.reads.findSimilar, {
      employeeId: rafael,
      description: "O wifi da sala de reunião está caindo de novo",
      category: "network_vpn",
    });

    // INC-20077 foi resolvido há 10 dias: entra pela janela de 30 (decisão 15).
    expect(result.ok && result.value.map((ticket) => ticket.code)).toEqual(["INC-20077"]);
  });
});
