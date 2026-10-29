import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { ConvexClientProvider } from "./convex-client-provider";

/**
 * Providers do Convex Auth. O provider de servidor lê o cookie da sessão e chama
 * Date.now(); com Cache Components isso só pode rodar na requisição, daí o
 * `connection()` e o <Suspense> em volta no layout.
 */
export async function AuthProviders({ children }: { children: ReactNode }) {
  await connection();
  return (
    <ConvexAuthNextjsServerProvider>
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </ConvexAuthNextjsServerProvider>
  );
}
