import { describe, expect, test } from "vitest";

import { decideRedirect } from "@/features/auth/route-access";
import { activeNavItem, PROFILE_PATH } from "../chat-navigation";

describe("activeNavItem", () => {
  test.each([
    ["/chat", "attendance"],
    ["/chat/k57abc123", "attendance"],
    ["/chat/perfil", "profile"],
  ] as const)("%s → %s", (pathname, expected) => {
    expect(activeNavItem(pathname)).toBe(expected);
  });
});

describe("rota do perfil", () => {
  const request = { pathname: PROFILE_PATH, pathWithSearch: PROFILE_PATH, next: null };

  test("o funcionário entra", () => {
    expect(decideRedirect(request, "employee")).toBeNull();
  });

  test("o analista vai para o console", () => {
    expect(decideRedirect(request, "analyst")).toBe("/console");
  });

  test("sem sessão vai para o login e volta ao perfil", () => {
    expect(decideRedirect(request, null)).toBe("/login?next=%2Fchat%2Fperfil");
  });
});
