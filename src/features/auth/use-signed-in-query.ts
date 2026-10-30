"use client";

import { useConvexAuth, useQuery } from "convex/react";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";

/**
 * `useQuery` que pula a query quando a sessão acabou. No "Sair", o Convex Auth apaga o token e
 * o cliente refaz as queries ainda abertas sem sessão; as que exigem login lançariam "Sessão
 * expirada" no console antes de o redirecionamento para o login acontecer. Pulando, a tela só
 * fica carregando até sair. Não abre brecha: sem sessão continua sem dados (o guard do Convex
 * segue recusando), só não há pedido.
 *
 * Enquanto a sessão ainda está sendo conferida (`isLoading`), a query vai normalmente: o
 * cliente do Convex já espera o token, e pular aqui só atrasaria a primeira tela.
 */
export function useSignedInQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query> | "skip",
): FunctionReturnType<Query> | undefined {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const signedOut = !isLoading && !isAuthenticated;
  // O TypeScript não resolve o resto de argumentos do `useQuery` para uma query genérica.
  const queryArgs = [signedOut ? "skip" : args] as unknown as OptionalRestArgs<Query>;
  return useQuery(query, ...queryArgs);
}
