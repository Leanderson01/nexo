import type { AnalystLevel, PersonRole } from "./enums";

export interface Person {
  name: string;
  email: string;
  role: PersonRole;
  department: string;
  /** Só para analistas. */
  level?: AnalystLevel;
}
