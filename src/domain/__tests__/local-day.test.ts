import { describe, expect, test } from "vitest";

import { localDay, startOfLocalDay } from "../local-day";

describe("dia de São Paulo (UTC-3)", () => {
  test("02:59 UTC ainda é o dia anterior; 03:00 UTC já é o dia seguinte", () => {
    expect(localDay(Date.UTC(2026, 9, 30, 2, 59))).toBe("2026-10-29");
    expect(localDay(Date.UTC(2026, 9, 30, 3, 0))).toBe("2026-10-30");
  });

  test("a meia-noite local é 03:00 UTC", () => {
    expect(startOfLocalDay(Date.UTC(2026, 9, 30, 15, 0))).toBe(Date.UTC(2026, 9, 30, 3, 0));
    expect(startOfLocalDay(Date.UTC(2026, 9, 30, 1, 0))).toBe(Date.UTC(2026, 9, 29, 3, 0));
  });
});
