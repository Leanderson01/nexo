"use client";

import { useEmployeeDeliveryAcks } from "./use-employee-receipt-acks";

/**
 * Confirma o "chegou" (✓✓ cinza) das respostas de todas as conversas do funcionário enquanto ele
 * está em qualquer tela do chat, inclusive o Meu perfil. Montado no layout, como o toast; não
 * desenha nada. O "leu" continua sendo da conversa aberta (decisão 32).
 */
export function EmployeeDeliveryAcks() {
  useEmployeeDeliveryAcks();
  return null;
}
