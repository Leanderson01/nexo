// Só no servidor: convexAuthNextjsToken lê os cookies (e importa "server-only").
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { ConvexHttpClient } from "convex/browser";

/**
 * Cliente do Convex que roda como a pessoa logada, para rotas e Server Components (§5.10).
 * Devolve null sem sessão; a rota responde 401 nesse caso.
 */
export async function createConvexClientForCurrentUser(): Promise<ConvexHttpClient | null> {
  const token = await convexAuthNextjsToken();
  if (!token) return null;

  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  client.setAuth(token);
  return client;
}
