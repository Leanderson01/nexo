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
