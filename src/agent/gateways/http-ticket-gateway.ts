import { GATEWAY_ERROR_KINDS, type GatewayErrorKind } from "@/domain/enums";
import { err, ok, type Result } from "@/domain/result";
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
import type { TicketGateway } from "./ticket-gateway";

// Adapter HTTP do serviço de chamados (§5.6). Nasce vinculado a um funcionário: o agent
// nunca informa de quem são os chamados. Trata a instabilidade do legado com timeout por
// tentativa e retry com espera crescente e jitter (decisão 16).

export type TicketGatewayMethod = keyof TicketGateway;

/** Uma tentativa de chamada HTTP, para o trace do agent (`withTrace` da T10). */
export interface TicketGatewayAttempt {
  method: TicketGatewayMethod;
  /** 1, 2 ou 3. */
  attempt: number;
  ok: boolean;
  latencyMs: number;
  errorKind?: GatewayErrorKind;
}

export interface HttpTicketGatewayOptions {
  /** URL `.site` do Convex (`NEXT_PUBLIC_CONVEX_SITE_URL`). */
  baseUrl: string;
  /** `TICKETING_SERVICE_KEY`, igual à configurada no deployment do Convex. */
  serviceKey: string;
  employeeId: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Fonte do jitter, entre 0 e 1. */
  random?: () => number;
  /** Limite de cada tentativa. */
  timeoutMs?: number;
  onAttempt?: (attempt: TicketGatewayAttempt) => void;
}

export const MAX_ATTEMPTS = 3;
/** Espera antes da 2ª e da 3ª tentativa. */
export const RETRY_DELAYS_MS = [300, 900] as const;
export const DEFAULT_TIMEOUT_MS = 2000;
const JITTER = 0.2;

const UNAVAILABLE_MESSAGE = "O sistema de chamados está instável no momento.";

/** Como terminou uma tentativa: sucesso, erro definitivo ou erro que vale repetir. */
type AttemptOutcome<T> =
  | { kind: "success"; value: T }
  | { kind: "final"; error: GatewayError }
  | { kind: "retry"; error: GatewayError };

export class HttpTicketGateway implements TicketGateway {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly timeoutMs: number;

  constructor(private readonly options: HttpTicketGatewayOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = options.random ?? Math.random;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  listMine(filter?: TicketFilter): Promise<Result<TicketSummary[], GatewayError>> {
    return this.call("listMine", { filter });
  }

  getMine(code: TicketCode): Promise<Result<TicketDetail, GatewayError>> {
    return this.call("getMine", { code });
  }

  findSimilar(input: SimilarityQuery): Promise<Result<TicketSummary[], GatewayError>> {
    return this.call("findSimilar", input);
  }

  create(input: NewTicket, idempotencyKey: string): Promise<Result<TicketDetail, GatewayError>> {
    return this.call("create", { ticket: input }, idempotencyKey);
  }

  addUpdate(
    code: TicketCode,
    input: TicketUpdateInput,
    idempotencyKey: string,
  ): Promise<Result<TicketDetail, GatewayError>> {
    return this.call("addUpdate", { code, update: input }, idempotencyKey);
  }

  reopen(
    code: TicketCode,
    reason: string,
    idempotencyKey: string,
  ): Promise<Result<TicketDetail, GatewayError>> {
    return this.call("reopen", { code, reason }, idempotencyKey);
  }

  async markHandoff(
    code: TicketCode | null,
    conversationId: string,
  ): Promise<Result<void, GatewayError>> {
    // A porta não recebe chave: a mesma transferência do mesmo chamado é uma escrita só.
    const idempotencyKey = `handoff:${conversationId}:${code ?? "sem-chamado"}`;
    const result = await this.call<null>("markHandoff", { code, conversationId }, idempotencyKey);
    return result.ok ? ok(undefined) : result;
  }

  // ---------- Retry ----------

  private async call<T>(
    method: TicketGatewayMethod,
    body: unknown,
    idempotencyKey?: string,
  ): Promise<Result<T, GatewayError>> {
    let lastError: GatewayError = { kind: "unavailable", message: UNAVAILABLE_MESSAGE };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const startedAt = performance.now();
      const outcome = await this.attemptOnce<T>(method, body, idempotencyKey);
      this.options.onAttempt?.({
        method,
        attempt,
        ok: outcome.kind === "success",
        latencyMs: Math.round(performance.now() - startedAt),
        ...(outcome.kind !== "success" && { errorKind: outcome.error.kind }),
      });

      if (outcome.kind === "success") return ok(outcome.value);
      if (outcome.kind === "final") return err(outcome.error);

      lastError = outcome.error;
      if (attempt < MAX_ATTEMPTS) await this.sleep(this.retryDelayMs(attempt));
    }
    return err(lastError);
  }

  /** ~300 ms antes da 2ª tentativa e ~900 ms antes da 3ª, com ±20% de jitter. */
  private retryDelayMs(failedAttempt: number): number {
    const base = RETRY_DELAYS_MS[failedAttempt - 1];
    const jitterFactor = 1 - JITTER + this.random() * 2 * JITTER;
    return Math.round(base * jitterFactor);
  }

  // ---------- Uma tentativa ----------

  private async attemptOnce<T>(
    method: TicketGatewayMethod,
    body: unknown,
    idempotencyKey?: string,
  ): Promise<AttemptOutcome<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${this.baseUrl}/ticketing/${method}`, {
        method: "POST",
        headers: this.headers(idempotencyKey),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return await this.readResponse<T>(response);
    } catch {
      // Timeout (abort), rede fora ou corpo cortado: o legado pode voltar em instantes.
      return { kind: "retry", error: { kind: "unavailable", message: UNAVAILABLE_MESSAGE } };
    } finally {
      clearTimeout(timeout);
    }
  }

  private headers(idempotencyKey?: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.options.serviceKey}`,
      "X-Employee-Id": this.options.employeeId,
      ...(idempotencyKey !== undefined && { "Idempotency-Key": idempotencyKey }),
    };
  }

  private async readResponse<T>(response: Response): Promise<AttemptOutcome<T>> {
    if (response.status >= 500) {
      return { kind: "retry", error: { kind: "unavailable", message: UNAVAILABLE_MESSAGE } };
    }
    // 401 é configuração errada (chave ou funcionário): repetir não resolve.
    if (response.status === 401) {
      return { kind: "final", error: { kind: "unavailable", message: UNAVAILABLE_MESSAGE } };
    }

    const payload = await readJson(response);
    if (response.ok) {
      if (isSuccessPayload(payload)) return { kind: "success", value: payload.value as T };
      // 200 com corpo cortado ou torto: trata como instabilidade.
      return { kind: "retry", error: { kind: "unavailable", message: UNAVAILABLE_MESSAGE } };
    }
    // 4xx: a resposta é definitiva (não encontrado, conflito, dado inválido).
    return { kind: "final", error: toGatewayError(payload) };
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function isSuccessPayload(payload: unknown): payload is { ok: true; value: unknown } {
  return typeof payload === "object" && payload !== null && "ok" in payload && payload.ok === true;
}

/** O erro do corpo `{ ok: false, error: { kind, message } }`, ou `unavailable` se vier torto. */
function toGatewayError(payload: unknown): GatewayError {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) {
    return { kind: "unavailable", message: UNAVAILABLE_MESSAGE };
  }
  const { error } = payload;
  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "message" in error &&
    isGatewayErrorKind(error.kind) &&
    typeof error.message === "string"
  ) {
    return { kind: error.kind, message: error.message };
  }
  return { kind: "unavailable", message: UNAVAILABLE_MESSAGE };
}

function isGatewayErrorKind(value: unknown): value is GatewayErrorKind {
  return (GATEWAY_ERROR_KINDS as readonly unknown[]).includes(value);
}
