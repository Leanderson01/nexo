import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";

/**
 * O pedaço do cliente do Convex que os serviços do rascunho usam. Na rota é o
 * `ConvexHttpClient` autenticado como o funcionário; nos testes, o `convex-test`.
 */
export interface ConvexCaller {
  query<Query extends FunctionReference<"query">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ): Promise<FunctionReturnType<Query>>;
  mutation<Mutation extends FunctionReference<"mutation">>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ): Promise<FunctionReturnType<Mutation>>;
}
