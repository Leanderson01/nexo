import type { GatewayErrorKind } from "@/domain/enums";

export interface GatewayError {
  kind: GatewayErrorKind;
  message: string;
}
