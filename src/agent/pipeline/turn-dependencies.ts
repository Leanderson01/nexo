import { ConvexKnowledgeGateway } from "@/agent/gateways/convex-knowledge-gateway";
import { HttpTicketGateway } from "@/agent/gateways/http-ticket-gateway";
import type { TicketGateway } from "@/agent/gateways/ticket-gateway";
import { readLlmConfig } from "@/agent/llm/models";
import { createLlmModels, type LlmModels } from "@/agent/llm/provider";
import type { OpenGateways } from "@/agent/tools/tool-session";

import { createConvexAgentStore, type AgentStore } from "./agent-store";
import type { RunTurnInput } from "./run-turn";

// Tudo o que um turno usa de fora: Convex, serviço de chamados, central de ajuda e LLM. O
// turno real lê do env do servidor do Next; os testes trocam por dublês sem rede.

/** Gateways já vinculados ao funcionário da conversa (§5.5). */
export interface EmployeeGateways {
  /** Para as tools: cada chamada ganha gateways ligados ao registro de tentativas dela. */
  openForTool: OpenGateways;
  /** Fora das tools (anotar a transferência no chamado). */
  tickets: TicketGateway;
}

export interface TurnDependencies {
  store: AgentStore;
  gatewaysFor(employeeId: string): EmployeeGateways;
  llm: { models: Pick<LlmModels, "fast" | "main">; fastModel: string; mainModel: string };
  now: () => number;
}

export function createTurnDependencies(input: RunTurnInput): TurnDependencies {
  const config = readLlmConfig(process.env);
  const ticketing = {
    baseUrl: requireEnv("NEXT_PUBLIC_CONVEX_SITE_URL"),
    serviceKey: requireEnv("TICKETING_SERVICE_KEY"),
  };

  return {
    store: createConvexAgentStore({
      convex: input.convex,
      agentSecret: input.agentSecret,
      conversationId: input.conversationId,
      assistantMessageId: input.assistantMessageId,
    }),
    gatewaysFor: (employeeId) => ({
      openForTool: (onAttempt) => ({
        tickets: new HttpTicketGateway({ ...ticketing, employeeId, onAttempt }),
        knowledge: new ConvexKnowledgeGateway({ client: input.convex, onAttempt }),
      }),
      tickets: new HttpTicketGateway({ ...ticketing, employeeId }),
    }),
    llm: {
      models: createLlmModels(config),
      fastModel: config.fastModel,
      mainModel: config.mainModel,
    },
    now: Date.now,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente ${name} ausente no servidor do Next.`);
  return value;
}
