import { describe, expect, test, vi } from "vitest";

import type { LlmConfig } from "@/agent/llm/models";
import type { PersonRole } from "@/domain/enums";
import type { TranscribeErrorBody } from "@/features/voice/transcribe-errors";
import {
  handleTranscribe,
  type TranscribeDeps,
  type TranscribeResponse,
} from "../handle-transcribe";
import { TRANSCRIPTION_PROMPT, createGroqTranscriber } from "../transcriber";

// A rota com o Groq falso: o `fetch` do provider responde como a API de transcrição, e
// conferimos o que foi enviado (idioma, formato) e o que a rota devolve.

const config: LlmConfig = {
  provider: "groq",
  apiKey: "chave-de-teste",
  fastModel: "openai/gpt-oss-20b",
  mainModel: "openai/gpt-oss-120b",
  transcriptionModel: "whisper-large-v3-turbo",
};

interface FakeGroqReply {
  status?: number;
  text?: string;
  duration?: number;
}

function fakeGroq(reply: FakeGroqReply = {}) {
  const sent: FormData[] = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(init?.body as FormData);
    if (reply.status && reply.status !== 200) {
      return Response.json(
        { error: { message: "falhou", type: "server_error" } },
        { status: reply.status },
      );
    }
    return Response.json({
      text: reply.text ?? " minha vpn não conecta desde ontem",
      x_groq: { id: "req_teste" },
      duration: reply.duration ?? 4.2,
    });
  });
  return { sent, fetch: fetchImpl as unknown as typeof fetch };
}

function deps(
  options: {
    role?: PersonRole | null;
    groq?: ReturnType<typeof fakeGroq>;
    withinDailyLimit?: boolean;
  } = {},
) {
  const groq = options.groq ?? fakeGroq();
  const recordedSeconds: number[] = [];
  const result: TranscribeDeps = {
    findCallerRole: async () => (options.role === undefined ? "employee" : options.role),
    transcribe: createGroqTranscriber(config, groq.fetch),
    model: config.transcriptionModel,
    maxSeconds: 60,
    isWithinDailyLimit: async () => options.withinDailyLimit ?? true,
    recordUsage: async (seconds) => {
      recordedSeconds.push(seconds);
    },
  };
  return { deps: result, groq, recordedSeconds };
}

function audioRequest(bytes: number, contentType = "audio/webm;codecs=opus") {
  return new Request("http://localhost/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(bytes).fill(7),
  });
}

async function errorCode(response: Response) {
  const body = (await response.json()) as TranscribeErrorBody;
  return body.error.code;
}

describe("limite diário de transcrição (§12.3)", () => {
  test("com o limite do dia esgotado, recusa sem chamar o provedor", async () => {
    const { deps: d, groq, recordedSeconds } = deps({ withinDailyLimit: false });
    const response = await handleTranscribe(audioRequest(20_000), d);

    expect(response.status).toBe(429);
    expect(await errorCode(response)).toBe("daily_limit_reached");
    expect(groq.sent).toHaveLength(0);
    expect(recordedSeconds).toEqual([]);
  });

  test("registra a duração de cada transcrição feita", async () => {
    const { deps: d, recordedSeconds } = deps({ groq: fakeGroq({ duration: 7.5 }) });
    await handleTranscribe(audioRequest(20_000), d);

    expect(recordedSeconds).toEqual([7.5]);
  });

  test("registra mesmo quando o texto sai vazio: o provedor cobrou", async () => {
    const { deps: d, recordedSeconds } = deps({ groq: fakeGroq({ text: "   ", duration: 3 }) });
    const response = await handleTranscribe(audioRequest(20_000), d);

    expect(await errorCode(response)).toBe("not_understood");
    expect(recordedSeconds).toEqual([3]);
  });
});

describe("POST /api/transcribe", () => {
  test("transcreve em português, pontua e devolve duração e custo", async () => {
    const { deps: d, groq } = deps();
    const response = await handleTranscribe(audioRequest(20_000), d);

    expect(response.status).toBe(200);
    const body = (await response.json()) as TranscribeResponse;
    expect(body.text).toBe("Minha vpn não conecta desde ontem.");
    expect(body.durationSeconds).toBe(4.2);
    // Áudio curto paga o mínimo de 10 s: 10/3600 × US$ 0,04.
    expect(body.estimatedCostUsd).toBeCloseTo((10 / 3600) * 0.04, 10);

    const form = groq.sent[0];
    expect(form.get("language")).toBe("pt");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    // Vocabulário do suporte e saída determinística.
    expect(form.get("prompt")).toBe(TRANSCRIPTION_PROMPT);
    expect(form.get("prompt")).toContain("VPN");
    expect(form.get("temperature")).toBe("0");
    expect((form.get("file") as File).name).toBe("audio.webm");
  });

  test("sem sessão: 401, sem chamar o provedor", async () => {
    const { deps: d, groq } = deps({ role: null });
    const response = await handleTranscribe(audioRequest(20_000), d);

    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("unauthorized");
    expect(groq.fetch).not.toHaveBeenCalled();
  });

  test("analista não transcreve: 403", async () => {
    const { deps: d } = deps({ role: "analyst" });
    const response = await handleTranscribe(audioRequest(20_000), d);

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("forbidden");
  });

  test("tipo que não é áudio aceito: 415", async () => {
    const { deps: d, groq } = deps();
    const response = await handleTranscribe(audioRequest(20_000, "application/json"), d);

    expect(response.status).toBe(415);
    expect(await errorCode(response)).toBe("unsupported_type");
    expect(groq.fetch).not.toHaveBeenCalled();
  });

  test("corpo vazio: 400 com a mensagem de áudio não entendido", async () => {
    const { deps: d } = deps();
    const response = await handleTranscribe(audioRequest(0), d);

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("empty_audio");
  });

  test("arquivo maior que o limite de 60 s: 413, sem chamar o provedor", async () => {
    const { deps: d, groq } = deps();
    const response = await handleTranscribe(audioRequest(60 * 48_000 + 1), d);

    expect(response.status).toBe(413);
    expect(await errorCode(response)).toBe("too_long");
    expect(groq.fetch).not.toHaveBeenCalled();
  });

  test("duração medida pelo Whisper acima do limite: 413, sem devolver o texto", async () => {
    const { deps: d } = deps({ groq: fakeGroq({ duration: 75 }) });
    const response = await handleTranscribe(audioRequest(20_000), d);

    expect(response.status).toBe(413);
    expect(await errorCode(response)).toBe("too_long");
  });

  test("áudio sem fala: 422 com a mensagem da §11.1", async () => {
    const { deps: d } = deps({ groq: fakeGroq({ text: "  ...  " }) });
    const response = await handleTranscribe(audioRequest(20_000), d);

    expect(response.status).toBe(422);
    const body = (await response.json()) as TranscribeErrorBody;
    expect(body.error).toEqual({
      code: "not_understood",
      message: "Não consegui entender o áudio, tente de novo ou digite.",
    });
  });

  test("falha do provedor: 502 com mensagem amigável, sem detalhes do erro", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps: d } = deps({ groq: fakeGroq({ status: 500 }) });
    const response = await handleTranscribe(audioRequest(20_000), d);

    expect(response.status).toBe(502);
    const raw = await response.text();
    expect(JSON.parse(raw)).toEqual({
      error: {
        code: "provider_failed",
        message: "Não consegui transcrever agora. Tente de novo em instantes ou digite.",
      },
    });
    expect(raw).not.toContain("falhou");
  });
});
