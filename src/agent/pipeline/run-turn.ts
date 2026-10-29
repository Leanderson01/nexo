import type { ConvexHttpClient } from "convex/browser";

import type { Id } from "../../../convex/_generated/dataModel";
import { createConvexMessageSink, StreamingMessage } from "./streaming-message";

// Um turno do agent, disparado pela rota de mensagens depois do 202 (`after()`, §5.7).
//
// T5: agent de ECO, só para provar o streaming de ponta a ponta. A T10 troca o corpo de
// `runTurn` pelo pipeline ENTENDER → DECIDIR → AGIR → REGISTRAR mantendo a assinatura:
//   - `convex` roda como o funcionário (leituras com o guard dele, §5.10);
//   - `agentSecret` autoriza as escritas da resposta (`appendDelta`, `finalize`, `fail`);
//   - a mensagem `assistantMessageId` já existe em `streaming` e a conversa está `agentBusy`.
// `runTurn` nunca lança: qualquer falha vira `fail` na mensagem, que libera a conversa.
// Se nem isso funcionar, o timeout de 60 s do Convex libera.

export interface RunTurnInput {
  conversationId: Id<"conversations">;
  /** Resposta vazia em `streaming`, criada por `sendUserMessage`. */
  assistantMessageId: Id<"messages">;
  /** Texto do funcionário como foi salvo (já mascarado). */
  userText: string;
  /** Cliente do Convex autenticado como o funcionário. */
  convex: ConvexHttpClient;
  /** AGENT_SERVER_SECRET, lido só no servidor do Next. */
  agentSecret: string;
}

export interface RunTurnOptions {
  /** Pausa entre as palavras do eco; os testes passam uma que não espera. */
  sleep?: (ms: number) => Promise<void>;
}

const ECHO_WORD_DELAY_MS = 60;

export const TURN_ERROR_MESSAGE = "Não consegui responder agora. Tente de novo em instantes.";

export async function runTurn(input: RunTurnInput, options: RunTurnOptions = {}): Promise<void> {
  const sleep = options.sleep ?? wait;
  const sink = createConvexMessageSink({
    convex: input.convex,
    agentSecret: input.agentSecret,
    messageId: input.assistantMessageId,
  });
  const reply = new StreamingMessage(sink);

  try {
    for (const word of splitIntoWords(buildEchoReply(input.userText))) {
      if (reply.stopped) return; // a mensagem expirou: não adianta continuar
      await reply.write(word);
      await sleep(ECHO_WORD_DELAY_MS);
    }
    await reply.finish();
  } catch (error) {
    console.error("[runTurn] turno falhou", { conversationId: input.conversationId, error });
    await reply.fail(TURN_ERROR_MESSAGE, true).catch((failError: unknown) => {
      console.error("[runTurn] não consegui gravar o erro; o timeout libera", failError);
    });
  }
}

export function buildEchoReply(userText: string): string {
  return `Recebi: "${userText}". Por enquanto eu só repito o que você escreve, para testar a conversa em tempo real.`;
}

/** Palavras com o espaço que as segue, para o texto remontado ficar idêntico. */
export function splitIntoWords(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
