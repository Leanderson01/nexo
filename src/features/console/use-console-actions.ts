"use client";

import { useMutation } from "convex/react";
import { useState } from "react";

import type { Result } from "@/domain/result";
import { api } from "../../../convex/_generated/api";
import type { ConsoleActionError } from "../../../convex/console";
import { CONSOLE_ACTION_ERROR_TEXTS } from "./console-texts";

export type ConsoleAction = "assign" | "send" | "return" | "close";

/**
 * As ações do analista sobre a conversa aberta. Cada uma devolve `true` se deu certo; o erro
 * esperado vira um texto em `error` (ex.: outro analista assumiu antes).
 */
export function useConsoleActions(conversationId: string) {
  const assignMutation = useMutation(api.console.assign);
  const sendMutation = useMutation(api.console.sendAnalystMessage);
  const returnMutation = useMutation(api.console.returnToAgent);
  const closeMutation = useMutation(api.console.close);
  const [running, setRunning] = useState<ConsoleAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(
    action: ConsoleAction,
    call: () => Promise<Result<null, ConsoleActionError>>,
  ): Promise<boolean> {
    setRunning(action);
    setError(null);
    try {
      const result = await call();
      if (!result.ok) setError(CONSOLE_ACTION_ERROR_TEXTS[result.error]);
      return result.ok;
    } catch {
      setError("Não foi possível concluir agora. Verifique sua conexão e tente de novo.");
      return false;
    } finally {
      setRunning(null);
    }
  }

  return {
    running,
    error,
    dismissError: () => setError(null),
    assign: () => run("assign", () => assignMutation({ conversationId })),
    send: (text: string) => run("send", () => sendMutation({ conversationId, text })),
    returnToAgent: (note: string) =>
      run("return", () => returnMutation({ conversationId, note: note.trim() || undefined })),
    close: () => run("close", () => closeMutation({ conversationId })),
  };
}
