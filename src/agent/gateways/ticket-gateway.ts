import type { Result } from "@/domain/result";
import type {
  NewTicket,
  SimilarityQuery,
  TicketCode,
  TicketDetail,
  TicketFilter,
  TicketSummary,
  TicketUpdateInput,
} from "@/domain/ticket";

import type { GatewayError } from "./gateway-error";

// Porta para o serviço de chamados (§5.6). Toda implementação já nasce vinculada ao
// funcionário da sessão: nenhum método recebe id de funcionário.
export interface TicketGateway {
  listMine(filter?: TicketFilter): Promise<Result<TicketSummary[], GatewayError>>;
  /** Chamado alheio e inexistente devolvem o mesmo `not_found`. */
  getMine(code: TicketCode): Promise<Result<TicketDetail, GatewayError>>;
  /** Candidatos a duplicidade: abertos e encerrados há até 30 dias, só do próprio funcionário (decisão 15). */
  findSimilar(input: SimilarityQuery): Promise<Result<TicketSummary[], GatewayError>>;
  create(input: NewTicket, idempotencyKey: string): Promise<Result<TicketDetail, GatewayError>>;
  addUpdate(
    code: TicketCode,
    input: TicketUpdateInput,
    idempotencyKey: string,
  ): Promise<Result<TicketDetail, GatewayError>>;
  reopen(
    code: TicketCode,
    reason: string,
    idempotencyKey: string,
  ): Promise<Result<TicketDetail, GatewayError>>;
  markHandoff(code: TicketCode | null, conversationId: string): Promise<Result<void, GatewayError>>;
}
