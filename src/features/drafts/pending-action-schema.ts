import { z } from "zod";

import {
  IMPACTS,
  PRIORITIES,
  TICKET_CATEGORIES,
  TICKET_KINDS,
  TICKET_STATUSES,
} from "@/domain/enums";
import type { PendingAction } from "@/domain/pending-action";
import { assertTypesMatch, type Equals } from "@/shared/type-equals";

// Corpo do PATCH do rascunho (edição inline). A forma é conferida aqui (400 se vier torta);
// conteúdo e prioridade, na mutation `pendingActions.edit`.

const newTicketSchema = z.object({
  kind: z.enum(TICKET_KINDS),
  category: z.enum(TICKET_CATEGORIES),
  title: z.string(),
  description: z.string(),
  affected: z.string(),
  prioritySignals: z.object({
    impact: z.enum(IMPACTS),
    blocked: z.boolean(),
    deadlineToday: z.boolean(),
  }),
  priority: z.enum(PRIORITIES),
  priorityReason: z.string(),
  reopenedFrom: z.string().optional(),
});

export const pendingActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create_ticket"), ticket: newTicketSchema }),
  z.object({
    kind: z.literal("update_ticket"),
    code: z.string(),
    text: z.string(),
    fieldChanges: z
      .object({
        status: z.enum(TICKET_STATUSES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        priorityReason: z.string().optional(),
        category: z.enum(TICKET_CATEGORIES).optional(),
      })
      .optional(),
  }),
  z.object({ kind: z.literal("reopen_ticket"), code: z.string(), reason: z.string() }),
]);

assertTypesMatch<Equals<z.infer<typeof pendingActionSchema>, PendingAction>>();

export const editDraftBody = z.object({
  pendingActionId: z.string(),
  action: pendingActionSchema,
});

export const draftIdBody = z.object({ pendingActionId: z.string() });
