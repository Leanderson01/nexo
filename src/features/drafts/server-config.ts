import { HttpTicketGateway } from "@/agent/gateways/http-ticket-gateway";
import type { TicketGateway } from "@/agent/gateways/ticket-gateway";

// Segredos que as rotas do rascunho e do "Tentar de novo" leem do servidor do Next.

export interface DraftServerConfig {
  /** AGENT_SERVER_SECRET: autoriza as mensagens do assistente e de sistema (§5.5). */
  agentSecret: string;
  /** Gateway do serviço de chamados vinculado a um funcionário (§5.6). */
  createGateway: (employeeId: string) => TicketGateway;
}

/** A configuração, ou null se falta alguma variável (a rota responde 503 e registra). */
export function readDraftServerConfig(): DraftServerConfig | null {
  const agentSecret = process.env.AGENT_SERVER_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  const serviceKey = process.env.TICKETING_SERVICE_KEY;
  if (!agentSecret || !baseUrl || !serviceKey) {
    console.error("[drafts] falta AGENT_SERVER_SECRET, TICKETING_SERVICE_KEY ou a URL do Convex");
    return null;
  }

  return {
    agentSecret,
    createGateway: (employeeId) => new HttpTicketGateway({ baseUrl, serviceKey, employeeId }),
  };
}
