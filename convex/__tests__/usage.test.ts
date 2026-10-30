/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { DecisionRecord } from "../../src/domain/decision-record";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// Limites de uso e custo do deploy público (T16, §12.3): uso diário no fuso de São Paulo,
// teto de custo do LLM, conversas por funcionário por dia e transcrição.

const modules = import.meta.glob("../**/*.ts");

const SECRET = "segredo-de-teste";
const MARIANA = "mariana.costa@nexo.com.br";

/** Quinta, 29/10/2026, 23:30 em São Paulo (UTC-3): meia hora antes da virada. */
const LATE_ON_29 = Date.UTC(2026, 9, 30, 2, 30);
/** Sexta, 30/10/2026, 00:30 em São Paulo. */
const EARLY_ON_30 = Date.UTC(2026, 9, 30, 3, 30);

type TestConvex = ReturnType<typeof convexTest>;

async function loginAs(t: TestConvex, email: string) {
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

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const mariana = await loginAs(t, MARIANA);
  return { t, mariana };
}

async function createConversation(mariana: Awaited<ReturnType<typeof loginAs>>) {
  const created = await mariana.mutation(api.conversations.create, {});
  if (!created.ok) throw new Error(`não criou a conversa: ${created.error}`);
  return created.value.conversationId;
}

/** Conversa começada: criada e com a primeira mensagem do funcionário. */
async function startConversation(mariana: Awaited<ReturnType<typeof loginAs>>, text = "Oi") {
  const conversationId = await createConversation(mariana);
  const sent = await mariana.mutation(api.messages.sendUserMessage, { conversationId, text });
  if (!sent.ok) throw new Error(`envio recusado: ${sent.error}`);
  return conversationId;
}

function recordWithCost(estimatedCostUsd: number): DecisionRecord {
  return {
    understanding: null,
    policies: [],
    actions: [],
    confidence: null,
    rationale: "Teste.",
    outcome: "answered",
    usage: {
      models: ["openai/gpt-oss-120b"],
      inputTokens: 1_000,
      outputTokens: 200,
      estimatedCostUsd,
      latencyMs: 1,
    },
    createdAt: Date.now(),
  };
}

/** Um turno completo: mensagem do funcionário e o registro com o custo. */
async function runTurnWithCost(
  t: TestConvex,
  mariana: Awaited<ReturnType<typeof loginAs>>,
  conversationId: Id<"conversations">,
  estimatedCostUsd: number,
) {
  const sent = await mariana.mutation(api.messages.sendUserMessage, {
    conversationId,
    text: "Minha VPN não conecta",
  });
  if (!sent.ok || !sent.value.assistantMessageId) throw new Error("o turno não começou");
  const messageId = sent.value.assistantMessageId;
  await t.mutation(api.agent.recordDecision, {
    secret: SECRET,
    conversationId,
    messageId,
    record: recordWithCost(estimatedCostUsd),
  });
  await t.mutation(api.messages.finalize, {
    secret: SECRET,
    messageId,
    parts: [{ type: "text", text: "Vamos ver." }],
  });
}

async function usageRows(t: TestConvex) {
  const rows = await t.run((ctx) => ctx.db.query("usage").collect());
  return rows.map(({ day, inputTokens, outputTokens, estimatedCostUsd }) => ({
    day,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(LATE_ON_29);
  vi.stubEnv("AGENT_SERVER_SECRET", SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("uso diário do LLM", () => {
  test("soma tokens e custo de cada turno no dia de São Paulo, e vira à meia-noite local", async () => {
    const { t, mariana } = await setup();
    const conversationId = await createConversation(mariana);

    await runTurnWithCost(t, mariana, conversationId, 0.001);
    await runTurnWithCost(t, mariana, conversationId, 0.002);
    vi.setSystemTime(EARLY_ON_30);
    await runTurnWithCost(t, mariana, conversationId, 0.004);

    const rows = await usageRows(t);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ day: "2026-10-29", inputTokens: 2_000, outputTokens: 400 });
    expect(rows[0].estimatedCostUsd).toBeCloseTo(0.003);
    expect(rows[1]).toMatchObject({ day: "2026-10-30", inputTokens: 1_000, outputTokens: 200 });
    expect(rows[1].estimatedCostUsd).toBeCloseTo(0.004);
  });
});

describe("teto diário de custo (MAX_DAILY_LLM_COST_USD)", () => {
  test("atingido: salva a mensagem, não dispara o turno e o campo mostra o aviso", async () => {
    vi.stubEnv("MAX_DAILY_LLM_COST_USD", "0.01");
    const { t, mariana } = await setup();
    const conversationId = await createConversation(mariana);
    await runTurnWithCost(t, mariana, conversationId, 0.01);

    const sent = await mariana.mutation(api.messages.sendUserMessage, {
      conversationId,
      text: "Ainda está sem VPN",
    });

    expect(sent.ok && sent.value.assistantMessageId).toBeNull();
    const conversation = await mariana.query(api.conversations.get, { conversationId });
    expect(conversation).toMatchObject({
      agentBusy: false,
      dailyLimitReached: true,
      employeeMessageCount: 2,
    });
    const messages = await mariana.query(api.messages.list, { conversationId });
    // Só a resposta do primeiro turno: a mensagem nova ficou sem resposta (e sem streaming).
    expect(messages?.filter((message) => message.role === "assistant")).toHaveLength(1);
    expect(messages?.filter((message) => message.role === "user").at(-1)?.parts).toEqual([
      { type: "text", text: "Ainda está sem VPN" },
    ]);
  });

  test("dailyLimitReached avisa antes de existir conversa (o 'Nova conversa' não cria)", async () => {
    vi.stubEnv("MAX_DAILY_LLM_COST_USD", "0.01");
    const { t, mariana } = await setup();
    expect(await mariana.query(api.conversations.dailyLimitReached, {})).toBe(false);

    const conversationId = await createConversation(mariana);
    await runTurnWithCost(t, mariana, conversationId, 0.01);
    expect(await mariana.query(api.conversations.dailyLimitReached, {})).toBe(true);
    await expect(t.query(api.conversations.dailyLimitReached, {})).rejects.toThrow(
      "Sessão expirada",
    );
  });

  test("abaixo do teto o turno dispara; no dia seguinte o agent volta a responder", async () => {
    vi.stubEnv("MAX_DAILY_LLM_COST_USD", "0.01");
    const { t, mariana } = await setup();
    const conversationId = await createConversation(mariana);
    await runTurnWithCost(t, mariana, conversationId, 0.009);
    await runTurnWithCost(t, mariana, conversationId, 0.005);

    const blocked = await mariana.mutation(api.messages.sendUserMessage, {
      conversationId,
      text: "Oi?",
    });
    expect(blocked.ok && blocked.value.assistantMessageId).toBeNull();

    vi.setSystemTime(EARLY_ON_30);
    const conversation = await mariana.query(api.conversations.get, { conversationId });
    expect(conversation?.dailyLimitReached).toBe(false);
    const nextDay = await mariana.mutation(api.messages.sendUserMessage, {
      conversationId,
      text: "Bom dia, e a VPN?",
    });
    expect(nextDay.ok && nextDay.value.assistantMessageId).not.toBeNull();
  });

  test("'Falar com um analista' leva a mensagem salva para a fila, com o motivo no resumo", async () => {
    vi.stubEnv("MAX_DAILY_LLM_COST_USD", "0");
    const { t, mariana } = await setup();
    const conversationId = await createConversation(mariana);
    await mariana.mutation(api.messages.sendUserMessage, { conversationId, text: "Oi" });

    const transferred = await mariana.mutation(api.conversations.requestAnalyst, {
      conversationId,
    });

    expect(transferred.ok).toBe(true);
    const conversation = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conversation?.status).toBe("waiting_analyst");
    expect(conversation?.handoff?.summary).toContain("limite de uso do dia");
  });

  test("o 'Tentar de novo' de um turno também respeita o teto e mantém o botão", async () => {
    const { t, mariana } = await setup();
    const conversationId = await createConversation(mariana);
    const sent = await mariana.mutation(api.messages.sendUserMessage, {
      conversationId,
      text: "Meu notebook não liga",
    });
    if (!sent.ok || !sent.value.assistantMessageId) throw new Error("o turno não começou");
    const failedMessageId = sent.value.assistantMessageId;
    await t.mutation(api.messages.fail, {
      secret: SECRET,
      messageId: failedMessageId,
      message: "Não consegui responder agora.",
      retryable: true,
    });
    const owner = await mariana.query(api.retry.loadForEmployee, { conversationId });
    if (!owner.ok) throw new Error("não achou a conversa");

    vi.stubEnv("MAX_DAILY_LLM_COST_USD", "0");
    const retried = await t.mutation(api.retry.start, {
      secret: SECRET,
      employeeId: owner.value.employeeId,
      conversationId,
    });

    expect(retried).toEqual({ ok: false, error: "daily_limit_reached" });
    const failed = await t.run((ctx) => ctx.db.get(failedMessageId));
    expect(failed?.parts).toContainEqual(expect.objectContaining({ retryable: true }));
  });
});

describe("conversas por funcionário por dia (MAX_CONVERSATIONS_PER_DAY)", () => {
  test("recusa a partir do limite e libera no dia seguinte", async () => {
    vi.stubEnv("MAX_CONVERSATIONS_PER_DAY", "2");
    const { mariana } = await setup();
    await startConversation(mariana);
    await startConversation(mariana);

    const third = await mariana.mutation(api.conversations.create, {});
    expect(third).toEqual({ ok: false, error: "conversation_limit_reached" });

    vi.setSystemTime(EARLY_ON_30);
    const nextDay = await mariana.mutation(api.conversations.create, {});
    expect(nextDay.ok).toBe(true);
  });

  test("conversa de ontem retomada hoje não conta como conversa nova", async () => {
    vi.stubEnv("MAX_CONVERSATIONS_PER_DAY", "1");
    const { mariana } = await setup();
    const yesterday = await createConversation(mariana);

    vi.setSystemTime(EARLY_ON_30);
    await mariana.mutation(api.messages.sendUserMessage, {
      conversationId: yesterday,
      text: "Voltei",
    });

    const today = await mariana.mutation(api.conversations.create, {});
    expect(today.ok).toBe(true);
  });
});

describe("conversas vazias (só o clique em 'Nova conversa')", () => {
  test("não contam para o limite do dia", async () => {
    vi.stubEnv("MAX_CONVERSATIONS_PER_DAY", "1");
    const { mariana } = await setup();
    await createConversation(mariana);
    await createConversation(mariana);
    await createConversation(mariana);

    const started = await startConversation(mariana, "Minha VPN caiu");
    expect(started).toBeDefined();

    const afterLimit = await mariana.mutation(api.conversations.create, {});
    expect(afterLimit).toEqual({ ok: false, error: "conversation_limit_reached" });
  });

  test("o 'Nova conversa' reaproveita a vazia de hoje em vez de acumular outra", async () => {
    const { t, mariana } = await setup();
    const first = await createConversation(mariana);
    const second = await createConversation(mariana);
    expect(second).toBe(first);

    await mariana.mutation(api.messages.sendUserMessage, { conversationId: first, text: "Oi" });
    const third = await createConversation(mariana);
    expect(third).not.toBe(first);

    const all = await t.run((ctx) => ctx.db.query("conversations").collect());
    const firstDoc = all.find((conversation) => conversation._id === first);
    const marianas = all.filter((conversation) => conversation.employeeId === firstDoc?.employeeId);
    expect(new Set(marianas.map((conversation) => conversation._id))).toEqual(
      new Set([first, third]),
    );
  });

  test("a vazia de ontem não é reaproveitada", async () => {
    const { mariana } = await setup();
    const yesterday = await createConversation(mariana);

    vi.setSystemTime(EARLY_ON_30);
    const today = await createConversation(mariana);
    expect(today).not.toBe(yesterday);
  });

  test("conversa transferida não volta como vazia", async () => {
    vi.stubEnv("MAX_DAILY_LLM_COST_USD", "0");
    const { mariana } = await setup();
    const conversationId = await startConversation(mariana, "Preciso de acesso ao SAP");
    await mariana.mutation(api.conversations.requestAnalyst, { conversationId });

    const next = await createConversation(mariana);
    expect(next).not.toBe(conversationId);
  });

  test("com resumo herdado, a vazia reaproveitada recebe o resumo", async () => {
    const { t, mariana } = await setup();
    const previous = await startConversation(mariana);
    await t.run((ctx) => ctx.db.patch(previous, { rollingSummary: "VPN caiu no home office." }));
    const empty = await createConversation(mariana);

    const created = await mariana.mutation(api.conversations.create, {
      inheritSummaryFrom: previous,
    });

    expect(created).toEqual({ ok: true, value: { conversationId: empty } });
    const conversation = await t.run((ctx) => ctx.db.get(empty));
    expect(conversation?.rollingSummary).toBe("VPN caiu no home office.");
  });
});

describe("teto diário a partir de uma conversa nova", () => {
  test("a conversa vazia não vai para a fila; com o pedido escrito, vai junto", async () => {
    vi.stubEnv("MAX_DAILY_LLM_COST_USD", "0");
    const { t, mariana } = await setup();
    const conversationId = await createConversation(mariana);

    const empty = await mariana.mutation(api.conversations.requestAnalyst, { conversationId });
    expect(empty).toEqual({ ok: false, error: "empty_conversation" });

    await mariana.mutation(api.messages.sendUserMessage, {
      conversationId,
      text: "Preciso resetar a senha do e-mail",
    });
    const transferred = await mariana.mutation(api.conversations.requestAnalyst, {
      conversationId,
    });
    expect(transferred.ok).toBe(true);

    const messages = await t.run((ctx) =>
      ctx.db
        .query("messages")
        .filter((q) => q.eq(q.field("conversationId"), conversationId))
        .collect(),
    );
    const request = messages.find((message) => message.role === "user");
    expect(request?.parts).toEqual([{ type: "text", text: "Preciso resetar a senha do e-mail" }]);
    expect(request?.receiver).toBe("analyst");
  });
});

describe("transcrição (quantidade e segundos por dia)", () => {
  async function check(t: TestConvex) {
    return await t.query(api.usage.checkTranscription, { secret: SECRET });
  }

  test("limite de segundos: recusa depois de somar o máximo e libera no dia seguinte", async () => {
    vi.stubEnv("MAX_DAILY_TRANSCRIPTION_SECONDS", "100");
    const { t } = await setup();

    expect(await check(t)).toEqual({ ok: true, value: null });
    await t.mutation(api.usage.recordTranscription, { secret: SECRET, seconds: 60 });
    expect((await check(t)).ok).toBe(true);
    await t.mutation(api.usage.recordTranscription, { secret: SECRET, seconds: 45 });
    expect(await check(t)).toEqual({ ok: false, error: "transcription_limit_reached" });

    vi.setSystemTime(EARLY_ON_30);
    expect((await check(t)).ok).toBe(true);
  });

  test("limite de quantidade", async () => {
    vi.stubEnv("MAX_DAILY_TRANSCRIPTIONS", "2");
    const { t } = await setup();
    await t.mutation(api.usage.recordTranscription, { secret: SECRET, seconds: 5 });
    await t.mutation(api.usage.recordTranscription, { secret: SECRET, seconds: 5 });

    expect(await check(t)).toEqual({ ok: false, error: "transcription_limit_reached" });
    const [row] = await t.run((ctx) => ctx.db.query("usage").collect());
    expect(row).toMatchObject({
      day: "2026-10-29",
      transcriptionCount: 2,
      transcriptionSeconds: 10,
    });
  });

  test("exige o segredo do servidor", async () => {
    const { t } = await setup();
    await expect(t.query(api.usage.checkTranscription, { secret: "chute" })).rejects.toThrow();
    await expect(
      t.mutation(api.usage.recordTranscription, { secret: "chute", seconds: 10 }),
    ).rejects.toThrow();
  });
});
