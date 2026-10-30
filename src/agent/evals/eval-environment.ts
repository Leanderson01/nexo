import { execFileSync } from "node:child_process";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ConversationSnapshot } from "./observation";
import type { ScenarioSetup } from "./scenario";

// O que o runner faz fora do turno do agent: ler a configuração, entrar como o funcionário,
// devolver o banco ao estado do seed e ligar o modo caos do serviço de chamados.

export interface EvalConfig {
  convexUrl: string;
  agentSecret: string;
  evalsSecret: string;
}

/** Lê do env (o script carrega o `.env.local`); a mensagem diz o que falta. */
export function readEvalConfig(env: Record<string, string | undefined>): EvalConfig {
  const missing = ["NEXT_PUBLIC_CONVEX_URL", "AGENT_SERVER_SECRET", "EVALS_SECRET"].filter(
    (name) => !env[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(
      `Faltam no .env.local: ${missing.join(", ")}. O EVALS_SECRET também precisa estar no Convex (npx convex env set EVALS_SECRET ...).`,
    );
  }
  return {
    convexUrl: env.NEXT_PUBLIC_CONVEX_URL!,
    agentSecret: env.AGENT_SERVER_SECRET!,
    evalsSecret: env.EVALS_SECRET!,
  };
}

/**
 * Entra como o funcionário pelo mesmo provedor do login (Convex Auth, credenciais do seed:
 * qualquer senha serve para e-mail cadastrado) e devolve um cliente autenticado como ele.
 */
export async function signInAs(convexUrl: string, email: string): Promise<ConvexHttpClient> {
  const client = new ConvexHttpClient(convexUrl);
  const result = await client.action(api.auth.signIn, {
    provider: "credentials",
    params: { email, password: "evals" },
  });
  const token = result.tokens?.token;
  if (!token) throw new Error(`O login de ${email} não devolveu token.`);
  client.setAuth(token);
  return client;
}

/** Apaga chamados e conversas de execuções anteriores e roda o seed de novo. */
export async function resetForScenario(config: EvalConfig, employeeEmail: string): Promise<void> {
  const client = new ConvexHttpClient(config.convexUrl);
  await client.mutation(api.evalsSupport.resetForScenario, {
    secret: config.evalsSecret,
    employeeEmail,
  });
}

/** A conversa inteira e os chamados do funcionário, lidos com o segredo dos evals. */
export async function observeConversation(
  config: EvalConfig,
  conversationId: Id<"conversations">,
): Promise<ConversationSnapshot> {
  const client = new ConvexHttpClient(config.convexUrl);
  return await client.query(api.evalsSupport.observe, {
    secret: config.evalsSecret,
    conversationId,
  });
}

// ---------- Variáveis do deployment (modo caos) ----------

/**
 * Aplica `setup.env` no deployment com a CLI do Convex e devolve como desfazer. As funções
 * HTTP do serviço de chamados leem o env a cada requisição, então vale na hora.
 */
export function applyDeploymentEnv(env: ScenarioSetup["env"]): () => void {
  const entries = Object.entries(env ?? {}).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  const previous = entries.map(([name]) => [name, readDeploymentEnv(name)] as const);
  for (const [name, value] of entries) convexCli(["env", "set", name, value]);

  return () => {
    for (const [name, value] of previous) {
      if (value === null) convexCli(["env", "remove", name]);
      else convexCli(["env", "set", name, value]);
    }
  };
}

function readDeploymentEnv(name: string): string | null {
  // Variável ausente: a CLI avisa no stderr e não escreve nada no stdout.
  const value = convexCli(["env", "get", name]).trim();
  return value === "" ? null : value;
}

function convexCli(args: string[]): string {
  return execFileSync("npx", ["convex", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}
