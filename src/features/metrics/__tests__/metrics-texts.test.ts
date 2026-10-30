import { describe, expect, test } from "vitest";

import {
  NO_DATA,
  barWidth,
  countText,
  durationText,
  percentText,
  periodText,
  usdText,
} from "../metrics-texts";

describe("textos do painel de métricas", () => {
  test("porcentagem arredondada; sem dado, traço", () => {
    expect(percentText(0.734)).toBe("73%");
    expect(percentText(1)).toBe("100%");
    expect(percentText(null)).toBe(NO_DATA);
  });

  test("custo com 4 casas, porque o turno custa frações de centavo", () => {
    expect(usdText(0.00213)).toBe("US$ 0,0021");
    expect(usdText(0)).toBe("US$ 0,0000");
    expect(usdText(null)).toBe(NO_DATA);
  });

  test("latência em ms abaixo de 1 s e em segundos acima", () => {
    expect(durationText(850)).toBe("850 ms");
    expect(durationText(4230)).toBe("4,2 s");
    expect(durationText(null)).toBe(NO_DATA);
  });

  test("contagem no singular e no plural", () => {
    expect(countText(1, "conversa", "conversas")).toBe("1 conversa");
    expect(countText(0, "conversa", "conversas")).toBe("0 conversas");
  });

  test("barra proporcional à maior; lista toda zerada não divide por zero", () => {
    expect(barWidth(2, 4)).toBe(50);
    expect(barWidth(0, 0)).toBe(0);
  });

  test("início do período no fuso de São Paulo", () => {
    expect(periodText(Date.UTC(2026, 9, 23, 17, 5))).toBe("Conversas iniciadas desde 23/10, 14:05");
  });
});
