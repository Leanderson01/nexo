import type { Impact, Intent, TicketCategory, TicketKind } from "./enums";

// Saída da etapa ENTENDER (§6.2). O schema Zod em src/agent/pipeline/understanding-schema.ts
// é conferido contra estes tipos em tempo de compilação.

export interface Entities {
  system: string | null;
  errorCode: string | null;
  os: string | null;
  device: string | null;
  /** Código do chamado ou descrição ("o do notebook"). */
  ticketRef: string | null;
}

export interface TicketSignals {
  kind: TicketKind | null;
  category: TicketCategory | null;
  impact: Impact | null;
  blocked: boolean | null;
  deadlineToday: boolean | null;
}

export interface Understanding {
  intent: Intent;
  summary: string;
  entities: Entities;
  ticketSignals: TicketSignals;
  missingFields: string[];
  confidence: number;
  confidenceReason: string;
}
