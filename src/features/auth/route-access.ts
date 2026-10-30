import type { PersonRole } from "@/domain/enums";

// Regras de acesso às páginas (§5.10), em código puro para o proxy e os testes.
// Funcionário fica em /chat, analista em /console; sem sessão, tudo vai para /login.

export const LOGIN_PATH = "/login";

export const HOME_BY_ROLE: Record<PersonRole, string> = {
  employee: "/chat",
  analyst: "/console",
};

/** Páginas que o proxy decide; o resto (API, arquivos) passa direto. */
export function isRoutedPage(pathname: string): boolean {
  return pathname === "/" || pathname === LOGIN_PATH || roleOwningPath(pathname) !== null;
}

function roleOwningPath(pathname: string): PersonRole | null {
  for (const role of Object.keys(HOME_BY_ROLE) as PersonRole[]) {
    const home = HOME_BY_ROLE[role];
    if (pathname === home || pathname.startsWith(`${home}/`)) return role;
  }
  return null;
}

// Origem fictícia só para o `new URL` resolver o caminho; o que importa é ela não mudar.
const PARSING_ORIGIN = "http://nexo.invalid";

// Controle, espaço (inclusive Unicode) e barra invertida: o navegador remove TAB e quebra de
// linha e troca "\" por "/", então "/<TAB>/evil.com" e "/\evil.com" viram "//evil.com".
const UNSAFE_CHARACTER = /[\p{C}\s\\]/u;

/**
 * Só aceita caminhos internos ("/chat/123"), nunca "//site.com", URLs absolutas ou caminhos
 * que o navegador transformaria nisso. Devolve o caminho normalizado pelo `URL`.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  if (UNSAFE_CHARACTER.test(next)) return null;

  let url: URL;
  try {
    url = new URL(next, PARSING_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PARSING_ORIGIN || !isPlainPathname(url.pathname)) return null;
  return url.pathname + url.search + url.hash;
}

/** O caminho continua seguro mesmo se alguém decodificar "%2F", "%5C" ou "%09" depois. */
function isPlainPathname(pathname: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  return [pathname, decoded].every(
    (candidate) =>
      candidate.startsWith("/") && !candidate.startsWith("//") && !UNSAFE_CHARACTER.test(candidate),
  );
}

export function loginPathFor(destination: string): string {
  if (destination === "/") return LOGIN_PATH;
  return `${LOGIN_PATH}?next=${encodeURIComponent(destination)}`;
}

interface RouteRequest {
  pathname: string;
  /** Caminho com a query, para voltar exatamente para onde a pessoa ia. */
  pathWithSearch: string;
  /** O `?next=` da página de login, se houver. */
  next: string | null;
}

/** Para onde redirecionar, ou null para seguir com a página pedida. */
export function decideRedirect(request: RouteRequest, role: PersonRole | null): string | null {
  const { pathname } = request;
  const owner = roleOwningPath(pathname);

  if (role === null) {
    if (pathname === LOGIN_PATH) return null;
    return loginPathFor(request.pathWithSearch);
  }

  if (pathname === LOGIN_PATH) {
    const next = safeNextPath(request.next);
    const nextOwner = next ? roleOwningPath(new URL(next, PARSING_ORIGIN).pathname) : null;
    return next && nextOwner === role ? next : HOME_BY_ROLE[role];
  }
  if (pathname === "/" || (owner !== null && owner !== role)) return HOME_BY_ROLE[role];
  return null;
}
