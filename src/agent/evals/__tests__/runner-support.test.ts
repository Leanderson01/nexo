import { describe, expect, it } from "vitest";

import { DEFAULT_OUT_FILE, parseEvalArgs, selectScenarios } from "../eval-args";
import { rateLimitedFetch, retryAfterMs } from "../rate-limited-fetch";
import { cancelDraft, pick, say } from "../scenario";
import { SCENARIOS } from "../scenarios";
import { transcriptLines } from "../transcript";

describe("parseEvalArgs", () => {
  it("sem opções: todos os cenários, uma vez, gravando o Markdown", () => {
    expect(parseEvalArgs([])).toEqual({
      ok: true,
      value: { only: [], repeat: 1, outFile: DEFAULT_OUT_FILE },
    });
  });

  it("--only repete, --repeat e --no-out", () => {
    const parsed = parseEvalArgs(["--only", "a", "--only", "b", "--repeat", "3", "--no-out"]);

    expect(parsed).toEqual({ ok: true, value: { only: ["a", "b"], repeat: 3, outFile: null } });
  });

  it("recusa repetição inválida e opção desconhecida", () => {
    expect(parseEvalArgs(["--repeat", "0"]).ok).toBe(false);
    expect(parseEvalArgs(["--repeat"]).ok).toBe(false);
    expect(parseEvalArgs(["--verbose"]).ok).toBe(false);
  });
});

describe("selectScenarios", () => {
  it("mantém a ordem do arquivo e recusa id desconhecido", () => {
    const selected = selectScenarios(SCENARIOS, ["prompt-injection", "vpn-809-windows-11"]);

    expect(selected.ok && selected.value.map((scenario) => scenario.id)).toEqual([
      "vpn-809-windows-11",
      "prompt-injection",
    ]);
    expect(selectScenarios(SCENARIOS, ["nao-existe"]).ok).toBe(false);
  });
});

describe("rateLimitedFetch", () => {
  function fakeFetch(statuses: number[], headers: Record<string, string> = {}) {
    const calls: number[] = [];
    const fetchImpl = (async () => {
      const status = statuses[calls.length] ?? 200;
      calls.push(status);
      return new Response(null, { status, headers });
    }) as typeof fetch;
    return { fetchImpl, calls };
  }

  it("no 429 espera o retry-after e repete", async () => {
    const waits: number[] = [];
    const { fetchImpl, calls } = fakeFetch([429, 429, 200], { "retry-after": "1.5" });
    const limited = rateLimitedFetch(fetchImpl, {
      maxWaits: 6,
      fallbackWaitMs: 10_000,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    const response = await limited("https://api.groq.com");

    expect(response.status).toBe(200);
    expect(calls).toEqual([429, 429, 200]);
    expect(waits).toEqual([1500, 1500]);
  });

  it("desiste depois de maxWaits e devolve o 429", async () => {
    const { fetchImpl, calls } = fakeFetch([429, 429, 429, 429]);
    const limited = rateLimitedFetch(fetchImpl, {
      maxWaits: 2,
      fallbackWaitMs: 10,
      sleep: async () => {},
    });

    expect((await limited("https://api.groq.com")).status).toBe(429);
    expect(calls).toHaveLength(3);
  });

  it("retry-after ausente ou inválido usa a espera padrão", () => {
    expect(retryAfterMs(null, 10_000)).toBe(10_000);
    expect(retryAfterMs("abc", 10_000)).toBe(10_000);
    expect(retryAfterMs("2", 10_000)).toBe(2000);
  });
});

describe("transcriptLines", () => {
  it("mostra a fala, a resposta, as partes e a decisão", () => {
    const lines = transcriptLines(say("Minha VPN"), {
      reply: {
        text: "Qual é o seu\nsistema?",
        parts: [
          { type: "text", text: "Qual é o seu\nsistema?" },
          {
            type: "quickReplies",
            options: [
              { label: "Windows 11", value: "Windows 11" },
              { label: "Windows 10", value: "Windows 10" },
            ],
          },
        ],
      },
      decision: null,
    });

    expect(lines).toEqual([
      "Funcionário: Minha VPN",
      "Assistente: Qual é o seu sistema?",
      "  [opções: Windows 11 | Windows 10]",
    ]);
  });

  it("botões e opções rápidas aparecem como ações; sem resposta, avisa", () => {
    expect(transcriptLines(cancelDraft(), { reply: null, decision: null })).toEqual([
      "Funcionário: [clica em Cancelar]",
      "Assistente: (nenhuma resposta)",
    ]);
    expect(transcriptLines(pick("Sim"), undefined)[0]).toBe('Funcionário: [escolhe "Sim"]');
  });
});
