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

  test("logado no login com destino malicioso vai para a área do papel", () => {
    expect(decideRedirect(request("/login", "/\t/evil.com"), "employee")).toBe("/chat");
    expect(decideRedirect(request("/login", "/.//evil.com"), "analyst")).toBe("/console");
  });
});

describe("safeNextPath", () => {
  // Cargas conhecidas de open redirect, já decodificadas (como o `searchParams.get` entrega)
  // e também ainda codificadas, caso alguém decodifique o caminho de novo depois.
  const OPEN_REDIRECT_PAYLOADS = [
    "//evil.com",
    "///evil.com",
    "////evil.com",
    "/\\evil.com",
    "\\/evil.com",
    "\\\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    "/\r\n/evil.com",
    "/ /evil.com",
    "/\u0000/evil.com",
    "/\u000b/evil.com",
    "/\u000c/evil.com",
    "/\u007f/evil.com",
    "/\u00a0/evil.com",
    "/\u2028/evil.com",
    "/\u3000/evil.com",
    "/\ufeff/evil.com",
    " //evil.com",
    "\t//evil.com",
    "/.//evil.com",
    "/./\\evil.com",
    "/%09/evil.com",
    "/%0a/evil.com",
    "/%0d/evil.com",
    "%2F%2Fevil.com",
    "/%2F/evil.com",
    "/%2f%2fevil.com",
    "/%5Cevil.com",
    "/%E0%A4%A",
    "%2f%5cevil.com",
    "https://evil.com",
    "http:evil.com",
    "https:/evil.com",
    "https:\\\\evil.com",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "evil.com",
    "@evil.com",
    "//nexo.com.br@evil.com",
    "/\\nexo.com.br@evil.com",
    "//evil.com/%2F..",
    "",
    null,
    undefined,
  ];

  test.each(OPEN_REDIRECT_PAYLOADS.map((payload) => [JSON.stringify(payload), payload]))(
    "recusa %s",
    (_label, payload) => {
      expect(safeNextPath(payload)).toBeNull();
    },
  );

  test("o que passa nunca sai da origem quando o navegador resolve", () => {
    const origin = "https://nexo.example";
    for (const payload of OPEN_REDIRECT_PAYLOADS) {
      const path = safeNextPath(payload);
      if (path !== null) expect(new URL(path, origin).origin).toBe(origin);
    }
  });

  test("aceita caminhos internos, normalizados", () => {
    expect(safeNextPath("/chat")).toBe("/chat");
    expect(safeNextPath("/chat/abc?x=1#fim")).toBe("/chat/abc?x=1#fim");
    expect(safeNextPath("/chat/../console")).toBe("/console");
    expect(safeNextPath("/chat/@evil.com")).toBe("/chat/@evil.com");
    expect(safeNextPath("/chat?busca=a%20b")).toBe("/chat?busca=a%20b");
  });
});

describe("isRoutedPage", () => {
  test("decide só as páginas do app", () => {
    expect(isRoutedPage("/chat/1")).toBe(true);
    expect(isRoutedPage("/chatbot")).toBe(false);
    expect(isRoutedPage("/api/conversations")).toBe(false);
  });
});
