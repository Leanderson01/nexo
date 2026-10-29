import { httpRouter } from "convex/server";
import { z } from "zod";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { httpAction, type ActionCtx } from "../_generated/server";
import {
  IMPACTS,
  PRIORITIES,
  TICKET_CATEGORIES,
  TICKET_KINDS,
  TICKET_STATUSES,
  type GatewayErrorKind,
} from "../../src/domain/enums";
import type { Result } from "../../src/domain/result";
import type { NewTicket, TicketFieldChanges } from "../../src/domain/ticket";
import { assertTypesMatch, type Equals } from "../../src/shared/type-equals";
import { pickLatencyMs, readChaosConfig, shouldFail } from "./chaos";
import type { ServiceError } from "./reads";

// API HTTP do legado simulado (§5.6 a). Só o servidor do Next conhece a chave, por isso o
// cabeçalho `X-Employee-Id` é confiável: o agent fala sempre em nome do funcionário da sessão.
//
//   POST /ticketing/<operação>
//   Authorization: Bearer <TICKETING_SERVICE_KEY>
//   X-Employee-Id: <id de people>
//   Idempotency-Key: <chave>            (só nas escritas)
//
//   200 { ok: true, value }
//   401 chave ou funcionário inválido
//   404 | 409 | 422 | 503 { ok: false, error: { kind, message } }
//   500 { ok: false, error: { kind: "unavailable", message } } para o inesperado

type HttpRouter = ReturnType<typeof httpRouter>;

// ---------- Corpos das requisições ----------

const nonEmpty = z.string().trim().min(1);

const fieldChangesSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  priorityReason: z.string().optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
});
assertTypesMatch<Equals<z.infer<typeof fieldChangesSchema>, TicketFieldChanges>>();

const newTicketSchema = z.object({
  kind: z.enum(TICKET_KINDS),
  category: z.enum(TICKET_CATEGORIES),
  title: nonEmpty,
  description: nonEmpty,
  affected: nonEmpty,
  prioritySignals: z.object({
    impact: z.enum(IMPACTS),
    blocked: z.boolean(),
    deadlineToday: z.boolean(),
  }),
  priority: z.enum(PRIORITIES),
  priorityReason: nonEmpty,
  reopenedFrom: z.string().optional(),
});
assertTypesMatch<Equals<z.infer<typeof newTicketSchema>, NewTicket>>();

const bodies = {
  listMine: z.object({ filter: z.object({ onlyOpen: z.boolean().optional() }).optional() }),
  getMine: z.object({ code: nonEmpty }),
  findSimilar: z.object({
    description: z.string(),
    category: z.enum(TICKET_CATEGORIES).nullable(),
  }),
  create: z.object({ ticket: newTicketSchema }),
  addUpdate: z.object({
    code: nonEmpty,
    update: z.object({ text: nonEmpty, fieldChanges: fieldChangesSchema.optional() }),
  }),
  reopen: z.object({ code: nonEmpty, reason: nonEmpty }),
  markHandoff: z.object({ code: nonEmpty.nullable(), conversationId: nonEmpty }),
};

// ---------- Rotas ----------

/** Dados de uma requisição já autenticada e validada. */
interface TicketingRequest<Body> {
  ctx: ActionCtx;
  employeeId: Id<"people">;
  body: Body;
  /** Presente sempre que a rota é de escrita. */
  idempotencyKey: string;
}

export function registerTicketingRoutes(http: HttpRouter): void {
  route(http, "listMine", bodies.listMine, false, ({ ctx, employeeId, body }) =>
    ctx.runQuery(internal.ticketing.reads.listMine, {
      employeeId,
      onlyOpen: body.filter?.onlyOpen,
    }),
  );

  route(http, "getMine", bodies.getMine, false, ({ ctx, employeeId, body }) =>
    ctx.runQuery(internal.ticketing.reads.getMine, { employeeId, code: body.code }),
  );

  route(http, "findSimilar", bodies.findSimilar, false, ({ ctx, employeeId, body }) =>
    ctx.runQuery(internal.ticketing.reads.findSimilar, { employeeId, ...body }),
  );

  route(http, "create", bodies.create, true, ({ ctx, employeeId, body, idempotencyKey }) =>
    ctx.runMutation(internal.ticketing.service.create, {
      employeeId,
      ticket: body.ticket,
      idempotencyKey,
    }),
  );

  // Pela API, quem atualiza é sempre o funcionário (no F3 a informação vem dele).
  route(http, "addUpdate", bodies.addUpdate, true, ({ ctx, employeeId, body, idempotencyKey }) =>
    ctx.runMutation(internal.ticketing.service.addUpdate, {
      employeeId,
      code: body.code,
      text: body.update.text,
      fieldChanges: body.update.fieldChanges,
      authorType: "employee",
      idempotencyKey,
    }),
  );

  route(http, "reopen", bodies.reopen, true, ({ ctx, employeeId, body, idempotencyKey }) =>
    ctx.runMutation(internal.ticketing.service.reopen, { employeeId, ...body, idempotencyKey }),
  );

  route(
    http,
    "markHandoff",
    bodies.markHandoff,
    true,
    ({ ctx, employeeId, body, idempotencyKey }) =>
      ctx.runMutation(internal.ticketing.service.markHandoff, {
        employeeId,
        ...body,
        idempotencyKey,
      }),
  );
}

function route<Body>(
  http: HttpRouter,
  operation: keyof typeof bodies,
  bodySchema: z.ZodType<Body>,
  isWrite: boolean,
  run: (request: TicketingRequest<Body>) => Promise<Result<unknown, ServiceError>>,
): void {
  http.route({
    path: `/ticketing/${operation}`,
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      try {
        return await handle(ctx, request, bodySchema, isWrite, run);
      } catch (error) {
        console.error(`[ticketing] erro inesperado em ${operation}`, error);
        return errorResponse(500, "unavailable", "Erro inesperado no sistema de chamados.");
      }
    }),
  });
}

async function handle<Body>(
  ctx: ActionCtx,
  request: Request,
  bodySchema: z.ZodType<Body>,
  isWrite: boolean,
  run: (request: TicketingRequest<Body>) => Promise<Result<unknown, ServiceError>>,
): Promise<Response> {
  if (!hasValidServiceKey(request)) return unauthorized("Chave do serviço inválida.");

  // Caos depois da autenticação: primeiro a latência, depois a falha.
  const chaos = readChaosConfig(process.env);
  const latencyMs = pickLatencyMs(chaos, Math.random);
  if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
  if (shouldFail(chaos, Math.random)) {
    return errorResponse(503, "unavailable", "Sistema de chamados indisponível no momento.");
  }

  const employeeId = await ctx.runQuery(internal.ticketing.reads.resolveEmployee, {
    employeeId: request.headers.get("X-Employee-Id") ?? "",
  });
  if (!employeeId) return unauthorized("Funcionário desconhecido.");

  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (isWrite && idempotencyKey === "") {
    return errorResponse(422, "validation", "Escritas exigem o cabeçalho Idempotency-Key.");
  }

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return errorResponse(422, "validation", `Corpo inválido: ${z.prettifyError(parsed.error)}`);
  }

  const result = await run({ ctx, employeeId, body: parsed.data, idempotencyKey });
  if (result.ok) return json(200, { ok: true, value: result.value });
  return errorResponse(STATUS_BY_KIND[result.error.kind], result.error.kind, result.error.message);
}

function hasValidServiceKey(request: Request): boolean {
  const expected = process.env.TICKETING_SERVICE_KEY;
  if (!expected) return false;
  return request.headers.get("Authorization") === `Bearer ${expected}`;
}

/** JSON do corpo, ou undefined se não for JSON (o Zod recusa em seguida). */
async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

// ---------- Respostas ----------

const STATUS_BY_KIND: Record<GatewayErrorKind, number> = {
  not_found: 404,
  conflict: 409,
  validation: 422,
  unavailable: 503,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, kind: GatewayErrorKind, message: string): Response {
  return json(status, { ok: false, error: { kind, message } });
}

function unauthorized(message: string): Response {
  return json(401, { ok: false, error: { kind: "unavailable", message } });
}
