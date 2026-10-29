import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRANSCRIPTION_MODEL,
  estimateCostUsd,
  estimateTranscriptionCostUsd,
  readLlmConfig,
} from "../models";

const validEnv = {
  LLM_PROVIDER: "groq",
  GROQ_API_KEY: "gsk_teste",
  LLM_MODEL_FAST: "openai/gpt-oss-20b",
  LLM_MODEL_MAIN: "openai/gpt-oss-120b",
};

describe("readLlmConfig", () => {
  it("lê provedor, chave e modelos, com transcrição padrão", () => {
    expect(readLlmConfig(validEnv)).toEqual({
      provider: "groq",
      apiKey: "gsk_teste",
      fastModel: "openai/gpt-oss-20b",
      mainModel: "openai/gpt-oss-120b",
      transcriptionModel: DEFAULT_TRANSCRIPTION_MODEL,
    });
  });

  it("aceita TRANSCRIPTION_MODEL", () => {
    const config = readLlmConfig({ ...validEnv, TRANSCRIPTION_MODEL: "whisper-large-v3" });
    expect(config.transcriptionModel).toBe("whisper-large-v3");
  });

  it.each(["LLM_PROVIDER", "GROQ_API_KEY", "LLM_MODEL_FAST", "LLM_MODEL_MAIN"])(
    "nomeia a variável ausente: %s",
    (name) => {
      expect(() => readLlmConfig({ ...validEnv, [name]: undefined })).toThrow(name);
    },
  );

  it("trata valor em branco como ausente", () => {
    expect(() => readLlmConfig({ ...validEnv, GROQ_API_KEY: "  " })).toThrow("GROQ_API_KEY");
  });

  it("recusa provedor não suportado", () => {
    expect(() => readLlmConfig({ ...validEnv, LLM_PROVIDER: "openai" })).toThrow(
      "LLM_PROVIDER=openai",
    );
  });
});

describe("estimateCostUsd", () => {
  it("cobra entrada e saída pelo preço por milhão", () => {
    // 1M de entrada a 0,15 + 1M de saída a 0,60.
    expect(estimateCostUsd("openai/gpt-oss-120b", 1_000_000, 1_000_000)).toBeCloseTo(0.75, 10);
  });

  it("dá 50% de desconto na entrada em cache", () => {
    // 2.000 de entrada, 1.000 delas em cache: 1.500 equivalentes a 0,075/M.
    expect(estimateCostUsd("openai/gpt-oss-20b", 2_000, 0, 1_000)).toBeCloseTo(
      (1_500 * 0.075) / 1_000_000,
      12,
    );
  });

  it("não deixa o cache passar da entrada total", () => {
    expect(estimateCostUsd("openai/gpt-oss-20b", 1_000, 0, 5_000)).toBeCloseTo(
      (500 * 0.075) / 1_000_000,
      12,
    );
  });

  it("recusa modelo sem preço", () => {
    expect(() => estimateCostUsd("modelo/desconhecido", 1, 1)).toThrow("modelo/desconhecido");
  });
});

describe("estimateTranscriptionCostUsd", () => {
  it("cobra no mínimo 10 s", () => {
    expect(estimateTranscriptionCostUsd("whisper-large-v3-turbo", 3)).toBeCloseTo(
      (10 / 3600) * 0.04,
      12,
    );
  });

  it("cobra a duração quando passa de 10 s", () => {
    expect(estimateTranscriptionCostUsd("whisper-large-v3-turbo", 60)).toBeCloseTo(
      (60 / 3600) * 0.04,
      12,
    );
  });

  it("recusa modelo sem preço", () => {
    expect(() => estimateTranscriptionCostUsd("outro", 10)).toThrow("outro");
  });
});
