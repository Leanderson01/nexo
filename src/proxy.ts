import {
  convexAuthNextjsMiddleware,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import type { NextFetchEvent, NextRequest } from "next/server";

import { api } from "../convex/_generated/api";
import type { PersonRole } from "@/domain/enums";
import { REMEMBER_ME_COOKIE, REMEMBER_ME_MAX_AGE_SECONDS } from "@/features/auth/remember-me";
import { decideRedirect, isRoutedPage } from "@/features/auth/route-access";

// Proxy (o antigo middleware do Next 16). O Convex Auth atende /api/auth e renova os
// tokens; depois, redirecionamos pelo papel da pessoa logada (route-access.ts).
// É uma checagem otimista: a autorização de verdade são os guards do Convex.

async function findRole(token: string | undefined): Promise<PersonRole | null> {
  if (!token) return null;
  try {
    const person = await fetchQuery(api.auth.currentPerson, {}, { token });
    return person?.role ?? null;
  } catch {
    return null; // Token vencido ou inválido: trata como sem sessão.
  }
}

const routeByRole: Parameters<typeof convexAuthNextjsMiddleware>[0] = async (
  request,
  { convexAuth },
) => {
  const { pathname, search, searchParams } = request.nextUrl;
  if (!isRoutedPage(pathname)) return;

  const role = await findRole(await convexAuth.getToken());
  const redirectTo = decideRedirect(
    { pathname, pathWithSearch: pathname + search, next: searchParams.get("next") },
    role,
  );
  if (redirectTo) return nextjsMiddlewareRedirect(request, redirectTo);
};

const rememberedSessionProxy = convexAuthNextjsMiddleware(routeByRole, {
  cookieConfig: { maxAge: REMEMBER_ME_MAX_AGE_SECONDS },
});
const browserSessionProxy = convexAuthNextjsMiddleware(routeByRole);

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const remember = request.cookies.get(REMEMBER_ME_COOKIE)?.value === "1";
  return remember ? rememberedSessionProxy(request, event) : browserSessionProxy(request, event);
}

export const config = {
  // Tudo menos arquivos estáticos e internos do Next.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
