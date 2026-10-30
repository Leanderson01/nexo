import type { ReceiptStatus } from "@/domain/read-receipts";
import { CheckIcon, ICON_SIZE, ReadReceiptIcon, SendingIcon } from "@/shared/icons";
import classes from "./read-receipt.module.css";

export const RECEIPT_LABELS: Record<ReceiptStatus, string> = {
  sending: "Enviando",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
};

/**
 * O ✓ de uma mensagem, ao lado do horário (UX1): reloginho enquanto só existe no cliente,
 * ✓ salva, ✓✓ cinza entregue e ✓✓ azul lida.
 */
export function ReadReceipt({ status }: { status: ReceiptStatus }) {
  const label = RECEIPT_LABELS[status];
  return (
    <span
      className={classes.receipt}
      data-status={status}
      role="img"
      aria-label={label}
      title={label}
    >
      <ReceiptGlyph status={status} />
    </span>
  );
}

function ReceiptGlyph({ status }: { status: ReceiptStatus }) {
  switch (status) {
    case "sending":
      return <SendingIcon size={ICON_SIZE.sm} />;
    case "sent":
      return <CheckIcon size={ICON_SIZE.sm} />;
    case "delivered":
    case "read":
      return <ReadReceiptIcon size={ICON_SIZE.sm} />;
  }
}
