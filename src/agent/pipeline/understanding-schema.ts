import { z } from "zod";

import { IMPACTS, INTENTS, TICKET_CATEGORIES, TICKET_KINDS } from "@/domain/enums";
import type { Understanding } from "@/domain/understanding";
import { assertTypesMatch, type Equals } from "@/shared/type-equals";

// Schema da saída estruturada da etapa ENTENDER (§6.2).
export const understandingSchema = z.object({
  intent: z.enum(INTENTS),
  summary: z.string(),
  entities: z.object({
    system: z.string().nullable(),
    errorCode: z.string().nullable(),
    os: z.string().nullable(),
    device: z.string().nullable(),
    ticketRef: z.string().nullable(),
  }),
  ticketSignals: z.object({
    kind: z.enum(TICKET_KINDS).nullable(),
    category: z.enum(TICKET_CATEGORIES).nullable(),
    impact: z.enum(IMPACTS).nullable(),
    blocked: z.boolean().nullable(),
    deadlineToday: z.boolean().nullable(),
  }),
  missingFields: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  confidenceReason: z.string(),
});

assertTypesMatch<Equals<z.infer<typeof understandingSchema>, Understanding>>();

/**
 * Trecho literal da fala do funcionário que sustenta cada sinal (`null` quando ele não disse).
 * O código confere o trecho e o valor (src/domain/signal-evidence.ts); sem evidência, o sinal
 * é descartado e o agent pergunta.
 */
export const signalEvidenceSchema = z.object({
  impact: z.string().nullable(),
  blocked: z.string().nullable(),
  deadlineToday: z.string().nullable(),
});
export type SignalQuotes = z.infer<typeof signalEvidenceSchema>;

/**
 * O que o modelo do ENTENDER devolve: o `Understanding` da §6.2 com a evidência dos sinais,
 * escrita antes dos sinais (o modelo cita primeiro e decide depois).
 */
export const understandingOutputSchema = z.object({
  intent: understandingSchema.shape.intent,
  summary: understandingSchema.shape.summary,
  entities: understandingSchema.shape.entities,
  signalEvidence: signalEvidenceSchema,
  ticketSignals: understandingSchema.shape.ticketSignals,
  missingFields: understandingSchema.shape.missingFields,
  confidence: understandingSchema.shape.confidence,
  confidenceReason: understandingSchema.shape.confidenceReason,
});
