// Integração offline: Mastra + @ai-sdk/groq de verdade, só o fetch é falso.
// Prova o que a T10 vai usar sem precisar da chave: o JSON schema enviado no ENTENDER,
// tools com contexto em closure, streaming de texto, uso somado e erros.
import { Agent } from "@mastra/core/agent";
import { classifyProviderError, MastraError } from "@mastra/core/error";
import { isMastraTimeoutError } from "@mastra/core/loop";
import { createTool } from "@mastra/core/tools";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { understandingSchema } from "@/agent/pipeline/understanding-schema";
import type { Understanding } from "@/domain/understanding";

import { estimateCostUsd, readLlmConfig } from "../models";
import { createLlmModels } from "../provider";
import {
  createFakeGroqFetch,
  jsonCompletion,
  rateLimited,
  streamText,
  streamToolCall,
} from "./fake-groq-fetch";

const FAST = "openai/gpt-oss-20b";
const MAIN = "openai/gpt-oss-120b";

const config = readLlmConfig({
  LLM_PROVIDER: "groq",
  GROQ_API_KEY: "gsk_teste",
  LLM_MODEL_FAST: FAST,
  LLM_MODEL_MAIN: MAIN,
});

const understanding: Understanding = {
  intent: "open_ticket",
  summary: "Quer abrir chamado: VPN com erro 809",
  entities: { system: "VPN", errorCode: "809", os: null, device: null, ticketRef: null },
  ticketSignals: {
    kind: "INC",
    category: "network_vpn",
    impact: null,
    blocked: null,
    deadlineToday: null,
  },
  missingFields: ["os"],
  confidence: 0.9,
  confidenceReason: "pedido claro",
};

interface SentJsonSchema {
  json_schema: {
    strict: boolean;
    schema: { properties: Record<string, Record<string, unknown>>; required: string[] };
  };
}

function sentResponseFormat(body: Record<string, unknown>): SentJsonSchema {
  return body.response_format as SentJsonSchema;
}

function understandAgent(fetchImpl: typeof fetch): Agent {
  const models = createLlmModels(config, fetchImpl);
  return new Agent({
    id: "understand",
    name: "understand",
    instructions: "Classifique a mensagem.",
    model: models.fast,
    errorProcessorDefaults: false,
  });
}

describe("ENTENDER: saída estruturada", () => {
  it("envia json_schema estrito com o understandingSchema, incluindo min/max da confiança", async () => {
    const fake = createFakeGroqFetch();
    fake.reply(jsonCompletion(FAST, JSON.stringify(understanding), { input: 120, output: 60 }));

    const out = await understandAgent(fake.fetch).generate("minha vpn deu erro 809", {
      structuredOutput: { schema: understandingSchema },
    });

    expect(out.object).toEqual(understanding);
    const body = fake.requests[0];
    expect(body.model).toBe(FAST);
    expect(body.tools).toBeUndefined();
    const format = sentResponseFormat(body);
    expect(format.json_schema.strict).toBe(true);
    const { properties, required } = format.json_schema.schema;
    // Decisão 18: no modo estrito o limite vai junto. Se o Groq recusar, é aqui que quebra.
    expect(properties.confidence).toEqual({ type: "number", minimum: 0, maximum: 1 });
    // Estrito exige todos os campos em required e nullable como união com null.
    expect(required).toEqual(Object.keys(understandingSchema.shape));
    expect(properties.entities.additionalProperties).toBe(false);
  });

  it("desliga o modo estrito por providerOptions, sem mudar o schema", async () => {
    const fake = createFakeGroqFetch();
    fake.reply(jsonCompletion(FAST, JSON.stringify(understanding), { input: 1, output: 1 }));

    await understandAgent(fake.fetch).generate("oi", {
      structuredOutput: { schema: understandingSchema },
      providerOptions: { groq: { strictJsonSchema: false } },
    });

    const format = sentResponseFormat(fake.requests[0]);
    expect(format.json_schema.strict).toBe(false);
    expect(format.json_schema.schema.properties.confidence.maximum).toBe(1);
  });

  it("confiança fora de [0, 1] vira MastraError de validação (o Zod é a rede de segurança)", async () => {
    const fake = createFakeGroqFetch();
    const invalid = { ...understanding, confidence: 1.5 };
    fake.reply(jsonCompletion(FAST, JSON.stringify(invalid), { input: 1, output: 1 }));

    const call = understandAgent(fake.fetch).generate("oi", {
      structuredOutput: { schema: understandingSchema },
    });

    await expect(call).rejects.toBeInstanceOf(MastraError);
    await expect(call).rejects.toMatchObject({ id: "STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED" });
  });

  it("plano B da decisão 18: schema enviado sem limite e confiança limitada em código", async () => {
    const fake = createFakeGroqFetch();
    const outOfRange = { ...understanding, confidence: 1.5 };
    fake.reply(jsonCompletion(FAST, JSON.stringify(outOfRange), { input: 1, output: 1 }));
    const unboundedSchema = understandingSchema.extend({ confidence: z.number() });

    const out = await understandAgent(fake.fetch).generate("oi", {
      structuredOutput: { schema: unboundedSchema },
    });

    const sent = sentResponseFormat(fake.requests[0]).json_schema.schema.properties;
    expect(sent.confidence).toEqual({ type: "number" });
    const clamped = understandingSchema.parse({
      ...out.object,
      confidence: Math.min(1, Math.max(0, out.object.confidence)),
    });
    expect(clamped.confidence).toBe(1);
  });
});

describe("AGIR: tools por requisição e streaming", () => {
  interface SessionContext {
    employeeId: string;
  }

  function createTools(session: SessionContext, calls: string[]) {
    return {
      listMyTickets: createTool({
        id: "listMyTickets",
        description: "Lista os chamados do funcionário logado.",
        inputSchema: z.object({ status: z.enum(["open", "resolved"]).nullable() }),
        outputSchema: z.object({ codes: z.array(z.string()) }),
        execute: async () => {
          calls.push(session.employeeId);
          return { codes: ["INC-20311"] };
        },
      }),
    };
  }

  it("executa a tool com o employeeId da closure, transmite o texto e soma o uso", async () => {
    const fake = createFakeGroqFetch();
    fake.reply(
      streamToolCall(
        MAIN,
        { id: "call_1", name: "listMyTickets", arguments: { status: null } },
        { input: 300, output: 20 },
      ),
    );
    fake.reply(
      streamText(MAIN, ["Seu chamado ", "INC-20311 ", "está vencido."], {
        input: 400,
        output: 30,
        cached: 300,
      }),
    );
    const calls: string[] = [];
    const models = createLlmModels(config, fake.fetch);
    const agent = new Agent({
      id: "act",
      name: "act",
      instructions: "Ajude o funcionário.",
      model: models.main,
      tools: createTools({ employeeId: "emp_mariana" }, calls),
      errorProcessorDefaults: false,
    });

    const out = await agent.stream("e o meu chamado do notebook?", { maxSteps: 3 });
    const pieces: string[] = [];
    for await (const piece of out.textStream) pieces.push(piece);

    // (b) closure: a tool viu o funcionário certo, e o id não está no schema enviado.
    expect(calls).toEqual(["emp_mariana"]);
    const sentTools = JSON.stringify(fake.requests[0].tools);
    expect(sentTools).toContain("listMyTickets");
    expect(sentTools).not.toContain("employeeId");
    expect(sentTools).not.toContain("emp_mariana");
    const secondMessages = JSON.stringify(fake.requests[1].messages);
    expect(secondMessages).toContain("INC-20311");
    expect(fake.requests[0].stream).toBe(true);

    // (c) pedaços de texto na ordem.
    expect(pieces).toEqual(["Seu chamado ", "INC-20311 ", "está vencido."]);
    expect(await out.text).toBe("Seu chamado INC-20311 está vencido.");
    expect(await out.finishReason).toBe("stop");

    // (d) totalUsage soma os dois passos. No Mastra 1.80, `usage` também vem somado;
    // o uso de cada passo fica em `steps`.
    const total = await out.totalUsage;
    expect(total.inputTokens).toBe(700);
    expect(total.outputTokens).toBe(50);
    expect(total.cachedInputTokens).toBe(300);
    expect((await out.usage).inputTokens).toBe(700);
    const steps = await out.steps;
    expect(steps.map((step) => step.usage.inputTokens)).toEqual([300, 400]);
    const cost = estimateCostUsd(
      MAIN,
      total.inputTokens ?? 0,
      total.outputTokens ?? 0,
      total.cachedInputTokens ?? 0,
    );
    expect(cost).toBeCloseTo((400 * 0.15 + 300 * 0.075 + 50 * 0.6) / 1_000_000, 12);
  });
});

describe("erros", () => {
  it("429: com errorProcessorDefaults false, maxRetries 1 faz 2 tentativas e o stream não lança", async () => {
    const fake = createFakeGroqFetch();
    fake.reply(rateLimited(0));
    fake.reply(rateLimited(0));
    const models = createLlmModels(config, fake.fetch);
    const agent = new Agent({
      id: "act",
      name: "act",
      instructions: "x",
      model: models.main,
      errorProcessorDefaults: false,
    });

    const out = await agent.stream("oi", { modelSettings: { maxRetries: 1 } });
    const pieces: string[] = [];
    for await (const piece of out.textStream) pieces.push(piece);

    expect(pieces).toEqual([]);
    expect(fake.requests).toHaveLength(2);
    expect(await out.finishReason).toBe("error");
    expect(classifyProviderError(out.error)).toBe("rate_limited");
  });

  it("timeout do primeiro pedaço vira MastraTimeoutError em out.error", async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const models = createLlmModels(config, hanging);
    const agent = new Agent({
      id: "act",
      name: "act",
      instructions: "x",
      model: models.main,
      errorProcessorDefaults: false,
    });

    const out = await agent.stream("oi", {
      modelSettings: { maxRetries: 0, timeout: { firstChunkMs: 50 } },
    });
    for await (const piece of out.textStream) expect(piece).toBeUndefined();

    expect(isMastraTimeoutError(out.error)).toBe(true);
    expect(await out.finishReason).toBe("error");
  });
});
