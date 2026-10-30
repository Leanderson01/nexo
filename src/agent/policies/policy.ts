import type {
  ConversationStatus,
  HandoffReason,
  OutOfScopeArea,
  PolicyActionKind,
  RefusalTopic,
} from "@/domain/enums";
import { assertTypesMatch, type Equals } from "@/shared/type-equals";
import type { DerivedPriority, TicketSummary } from "@/domain/ticket";
import type { Understanding } from "@/domain/understanding";

// Contrato das políticas da etapa DECIDIR (§6.3). Cada política vive em um arquivo,
// é pura e é avaliada em ordem; todas aparecem no painel, inclusive as que não se aplicam.

export interface TurnContext {
  now: number;
  understanding: Understanding;
  conversationStatus: ConversationStatus;
  clarificationAttempts: number;
  /** Chamado em foco, resolvido em código entre ENTENDER e DECIDIR (TASKS.md, decisão 2). */
  focusedTicket: TicketSummary | null;
  /** Prioridade derivada dos sinais da mensagem, quando há sinais suficientes. */
  derivedPriority: DerivedPriority | null;
}

export type PolicyAction =
  /** Curto-circuita: transfere sem chamar o modelo principal. */
  | { kind: "handoff"; reason: HandoffReason }
  /** Curto-circuita: redireciona assunto que não é de TI. */
  | { kind: "redirect_out_of_scope"; area: OutOfScopeArea }
  /** Curto-circuita: recusa educada, sem modelo (pedido para mudar as regras, ou fora de TI sem área). */
  | { kind: "refuse"; topic: RefusalTopic }
  /** O agent segue, mas precisa oferecer a transferência. */
  | { kind: "offer_handoff"; reason: HandoffReason }
  | { kind: "ask_clarification" };

// O `DecisionRecord` guarda só o `kind` da ação (POLICY_ACTION_KINDS); as duas listas não podem divergir.
assertTypesMatch<Equals<PolicyAction["kind"], PolicyActionKind>>();

export type PolicyResult =
  | { outcome: "not_applicable"; note?: string }
  | { outcome: "triggered"; action: PolicyAction; explanation: string };

export interface Policy {
  /** Exibido no painel de decisão. */
  name: string;
  evaluate(ctx: TurnContext): PolicyResult;
}
