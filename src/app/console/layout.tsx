import { ConsoleFrame } from "@/features/console/console-frame";

/** Moldura do console do analista: trilho, fila de conversas e a conversa aberta. */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleFrame>{children}</ConsoleFrame>;
}
