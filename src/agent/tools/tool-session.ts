import type { z } from "zod";

import type { ToolName } from "@/agent/evals/scenario";
import type { KnowledgeGateway } from "@/agent/gateways/knowledge-gateway";
import type { TicketGateway } from "@/agent/gateways/ticket-gateway";
import type { AgentStore } from "@/agent/pipeline/agent-store";
import type { TurnWorkspace } from "@/agent/pipeline/turn-workspace";
import type { GatewayErrorKind } from "@/domain/enums";
import type { SaidSignals } from "@/domain/signal-evidence";
import type { Understanding } from "@/domain/understanding";

// Contexto que as tools recebem em closure (§5.5, `createTools(sessionContext)`). O modelo
// nunca vê nem informa ids: o funcionário e a conversa já vêm fixados aqui.

/** Uma tentativa de chamada a um gateway; alimenta `attempts` e `attemptErrors` do trace. */
export interface GatewayAttempt {
  ok: boolean;
  errorKind?: GatewayErrorKind;
}

/** Gateways de uma chamada de tool, já ligados ao registro de tentativas dessa chamada. */
export interface ToolGateways {
  tickets: TicketGateway;
  knowledge: KnowledgeGateway;
}

export type OpenGateways = (onAttempt: (attempt: GatewayAttempt) => void) => ToolGateways;

export interface ToolSession {
  now: number;
  conversationId: string;
  employee: { name: string; department: string };
  /** O ENTENDER com os sinais e o sistema operacional já conferidos contra a conversa. */
  understanding: Understanding;
  /** O que a conversa mostra de fato: base para a descrição não inventar nada (§11.2). */
  facts: {
    /** As mensagens do funcionário na janela do turno, terminando na atual. */
    employeeTexts: string[];
    /** Artigos que o funcionário disse que não resolveram. */
    articlesTried: string[];
    /** Sinais que o ENTENDER trouxe e a fala não confirmou: antes de usá-los, o agent pergunta. */
    unconfirmedSignals: Partial<SaidSignals>;
  };
  store: Pick<AgentStore, "createDraft" | "transfer">;
  workspace: TurnWorkspace;
}

/** Resultado de sucesso que a tool devolve ao modelo. */
export interface ToolSuccess {
  ok: true;
}

/** Falha esperada, com a instrução para o modelo; vira `status: "error"` no trace. */
export interface ToolFailure {
  ok: false;
  error: string;
}

/**
 * Uma tool do agent antes de virar tool do Mastra: o `withTrace` registra cada chamada
 * (entrada e saída resumidas, latência, tentativas) no `DecisionRecord`.
 */
export interface AgentTool<Input, Output extends ToolSuccess> {
  name: ToolName;
  /** Texto do chip na resposta: "consultou seus chamados". */
  label: string;
  /** Chip quando a tool recusa (ex.: rascunho sem os sinais); sem ele, vale o `label`. */
  failureLabel?: string;
  /**
   * A recusa não vira chamada registrada (nem chip): é um "nada a fazer" do próprio turno, como
   * as opções pedidas de novo (QA R1: o chip "manteve as opções do turno" era jargão).
   */
  silentRefusal?: boolean;
  /** O que o modelo lê para decidir quando usar a tool. */
  description: string;
  inputSchema: z.ZodType<Input>;
  describeInput(input: Input): string;
  describeOutput(output: Output): string;
  run(input: Input, gateways: ToolGateways): Promise<Output | ToolFailure>;
}
