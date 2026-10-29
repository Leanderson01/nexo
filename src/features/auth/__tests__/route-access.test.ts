import { describe, expect, test } from "vitest";

import { decideRedirect, isRoutedPage, safeNextPath } from "../route-access";

function request(pathWithSearch: string, next: string | null = null) {
  const pathname = pathWithSearch.split("?")[0];
  return { pathname, pathWithSearch, next };
}

describe("decideRedirect", () => {
  test("sem sessão, manda para o login guardando o destino", () => {
    expect(decideRedirect(request("/chat/abc?x=1"), null)).toBe(
      "/login?next=%2Fchat%2Fabc%3Fx%3D1",
    );
    expect(decideRedirect(request("/console"), null)).toBe("/login?next=%2Fconsole");
    expect(decideRedirect(request("/"), null)).toBe("/login");
    expect(decideRedirect(request("/login"), null)).toBeNull();
  });

  test("cada papel fica na sua área", () => {
    expect(decideRedirect(request("/chat"), "employee")).toBeNull();
    expect(decideRedirect(request("/console/123"), "analyst")).toBeNull();
    expect(decideRedirect(request("/console"), "employee")).toBe("/chat");
    expect(decideRedirect(request("/chat"), "analyst")).toBe("/console");
    expect(decideRedirect(request("/"), "analyst")).toBe("/console");
  });

  test("logado no login vai para o destino guardado, se for da sua área", () => {
    expect(decideRedirect(request("/login", "/chat/abc"), "employee")).toBe("/chat/abc");
    expect(decideRedirect(request("/login", "/console"), "employee")).toBe("/chat");
    expect(decideRedirect(request("/login"), "analyst")).toBe("/console");
  });
});

describe("safeNextPath", () => {
  test("recusa destinos fora do site", () => {
    expect(safeNextPath("//evil.com")).toBeNull();
    expect(safeNextPath("https://evil.com")).toBeNull();
    expect(safeNextPath("/\\evil.com")).toBeNull();
    expect(safeNextPath("/chat")).toBe("/chat");
  });
});

describe("isRoutedPage", () => {
  test("decide só as páginas do app", () => {
    expect(isRoutedPage("/chat/1")).toBe(true);
    expect(isRoutedPage("/chatbot")).toBe(false);
    expect(isRoutedPage("/api/conversations")).toBe(false);
  });
});
