"use client";

import { LucideProvider } from "lucide-react";

import { ICON_SIZE, ICON_STROKE } from "./sizes";

/** Tamanho e traço padrão de todos os ícones do app (cada uso ainda pode passar `size`). */
export function IconProvider({ children }: { children: React.ReactNode }) {
  return (
    <LucideProvider size={ICON_SIZE.md} strokeWidth={ICON_STROKE}>
      {children}
    </LucideProvider>
  );
}
