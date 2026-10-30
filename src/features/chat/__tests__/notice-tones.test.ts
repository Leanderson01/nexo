import { describe, expect, test } from "vitest";

import { draftNoticeTone } from "@/features/drafts/draft-api-errors";
import { isRetryableChatError } from "../api-errors";

describe("isRetryableChatError (aviso de mensagem não enviada)", () => {
  test("servidor fora tem 'Tentar de novo'", () => {
    expect(isRetryableChatError("unavailable")).toBe(true);
  });

  test("limites e conversa encerrada não têm: tentar de novo não mudaria nada", () => {
    expect(isRetryableChatError("conversation_limit_reached")).toBe(false);
    expect(isRetryableChatError("limit_reached")).toBe(false);
    expect(isRetryableChatError("closed")).toBe(false);
  });
});

describe("draftNoticeTone (aviso das ações do rascunho e do retry)", () => {
  test("falha é erro (vermelho)", () => {
    expect(draftNoticeTone("unavailable")).toBe("error");
    expect(draftNoticeTone("invalid_draft")).toBe("error");
  });

  test("limite ou recusa pelo estado é aviso (âmbar)", () => {
    expect(draftNoticeTone("daily_limit_reached")).toBe("warning");
    expect(draftNoticeTone("not_pending")).toBe("warning");
  });
});
