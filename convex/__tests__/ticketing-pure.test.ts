import { describe, expect, test } from "vitest";

import { pickLatencyMs, readChaosConfig, shouldFail } from "../ticketing/chaos";
import { normalizeWords, rankBySimilarity, similarityScore } from "../ticketing/similarity";

// Funções puras do serviço de chamados: ranking de semelhança e leitura do modo caos.

describe("similarity", () => {
  test("normaliza acento, caixa, pontuação e palavras vazias", () => {
    expect([...normalizeWords("A VPN não conecta, de novo!")]).toEqual(["vpn", "conecta", "novo"]);
  });

  test("pontua palavras em comum e soma 1 quando a categoria bate", () => {
    const ticket = {
      title: "VPN não conecta",
      description: "Erro 809 ao conectar na VPN",
      category: "network_vpn" as const,
      lastActivityAt: 0,
    };

    expect(similarityScore({ description: "vpn com erro 809", category: null }, ticket)).toBe(3);
    expect(
      similarityScore({ description: "vpn com erro 809", category: "network_vpn" }, ticket),
    ).toBe(4);
    expect(similarityScore({ description: "impressora sem tinta", category: null }, ticket)).toBe(
      0,
    );
  });

  test("ordena por pontuação, desempata pela atividade mais recente e corta em 5", () => {
    const make = (title: string, lastActivityAt: number) => ({
      title,
      description: "",
      category: "other" as const,
      lastActivityAt,
    });
    const tickets = [
      make("vpn", 1),
      make("vpn erro", 2),
      make("vpn", 3),
      make("impressora", 4),
      make("vpn", 5),
      make("vpn", 6),
      make("vpn", 7),
    ];

    const ranked = rankBySimilarity({ description: "vpn erro", category: null }, tickets);

    expect(ranked.map((ticket) => ticket.lastActivityAt)).toEqual([2, 7, 6, 5, 3]);
  });
});

describe("chaos", () => {
  test("sem variáveis, não há caos", () => {
    expect(readChaosConfig({})).toEqual({ failureRate: 0, latencyMs: null });
  });

  test("lê a taxa e a faixa de latência", () => {
    expect(
      readChaosConfig({ TICKETING_FAILURE_RATE: "0.1", TICKETING_LATENCY_MS: "200-1500" }),
    ).toEqual({ failureRate: 0.1, latencyMs: { min: 200, max: 1500 } });
  });

  test("valores inválidos desligam o caos", () => {
    expect(
      readChaosConfig({ TICKETING_FAILURE_RATE: "1.5", TICKETING_LATENCY_MS: "1500-200" }),
    ).toEqual({ failureRate: 0, latencyMs: null });
    expect(
      readChaosConfig({ TICKETING_FAILURE_RATE: "muito", TICKETING_LATENCY_MS: "rápido" }),
    ).toEqual({ failureRate: 0, latencyMs: null });
  });

  test("sorteia a latência dentro da faixa e falha conforme a taxa", () => {
    const config = { failureRate: 0.25, latencyMs: { min: 200, max: 1500 } };

    expect(pickLatencyMs(config, () => 0)).toBe(200);
    expect(pickLatencyMs(config, () => 0.5)).toBe(850);
    expect(pickLatencyMs({ failureRate: 0, latencyMs: null }, () => 0.5)).toBe(0);
    expect(shouldFail(config, () => 0.2)).toBe(true);
    expect(shouldFail(config, () => 0.3)).toBe(false);
  });
});
