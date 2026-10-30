import type { ConvexHttpClient } from "convex/browser";

import type { MessagePart } from "@/domain/message-parts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// Escrita incremental da resposta do agent (§5.7, passo 4). O texto é juntado e gravado em
// lotes de ~150 ms; as partes estruturadas entram só no fim. As mutations devolvem `false`
// quando a mensagem já saiu de `streaming` (ex.: o timeout de 60 s venceu): daí em diante
// o escritor ignora tudo, e o pipeline pode consultar `stopped` para parar de trabalhar.

export const STREAM_FLUSH_INTERVAL_MS = 150;

/** As três escritas do agent sobre uma mensagem, já com o segredo e o id. */
export interface AgentMessageSink {
  appendDelta(delta: string): Promise<boolean>;
  /** `text`, quando vem, substitui o texto já transmitido (correção em código, decisão 25). */
  finalize(parts: MessagePart[], decisionId?: Id<"decisions">, text?: string): Promise<boolean>;
  fail(message: string, retryable: boolean): Promise<boolean>;
}

export function createConvexMessageSink(options: {
  convex: ConvexHttpClient;
  agentSecret: string;
  messageId: Id<"messages">;
}): AgentMessageSink {
  const { convex, agentSecret: secret, messageId } = options;
  return {
    appendDelta: (delta) => convex.mutation(api.messages.appendDelta, { secret, messageId, delta }),
    finalize: (parts, decisionId, text) =>
      convex.mutation(api.messages.finalize, { secret, messageId, parts, decisionId, text }),
    fail: (message, retryable) =>
      convex.mutation(api.messages.fail, { secret, messageId, message, retryable }),
  };
}

export class StreamingMessage {
  private pendingText = "";
  private lastFlushAt: number;
  private isStopped = false;

  constructor(
    private readonly sink: AgentMessageSink,
    private readonly now: () => number = Date.now,
    private readonly flushIntervalMs: number = STREAM_FLUSH_INTERVAL_MS,
  ) {
    this.lastFlushAt = now();
  }

  /** Verdadeiro depois do fim do turno ou quando a mensagem saiu de `streaming`. */
  get stopped(): boolean {
    return this.isStopped;
  }

  /** Junta o pedaço; grava quando já passou o intervalo desde a última gravação. */
  async write(delta: string): Promise<void> {
    if (this.isStopped) return;
    this.pendingText += delta;
    if (this.now() - this.lastFlushAt >= this.flushIntervalMs) await this.flush();
  }

  /** Grava o texto juntado agora (útil antes de uma pausa longa, como uma tool lenta). */
  async flush(): Promise<void> {
    if (this.isStopped || this.pendingText === "") return;
    const delta = this.pendingText;
    this.pendingText = "";
    this.lastFlushAt = this.now();
    const written = await this.sink.appendDelta(delta);
    if (!written) this.isStopped = true;
  }

  /**
   * Grava o resto do texto e conclui com as partes estruturadas. Com `replacementText`, o texto
   * transmitido até aqui é trocado por ele (o resto pendente é descartado).
   */
  async finish(
    parts: MessagePart[] = [],
    decisionId?: Id<"decisions">,
    replacementText?: string,
  ): Promise<void> {
    if (replacementText === undefined) await this.flush();
    else this.pendingText = "";
    if (this.isStopped) return;
    this.isStopped = true;
    await this.sink.finalize(parts, decisionId, replacementText);
  }

  /** Conclui com erro amigável; o texto já gravado fica na mensagem. */
  async fail(message: string, retryable: boolean): Promise<void> {
    await this.flush();
    if (this.isStopped) return;
    this.isStopped = true;
    await this.sink.fail(message, retryable);
  }
}
