import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DecisionPanelGallery } from "./decision-panel-gallery";

// Página interna de desenvolvimento: o painel de decisão com registros falsos dos cenários
// da spec. Não existe em produção.

export const metadata: Metadata = { title: "Painel de decisão (fixtures) · Nexo Assist" };

export default function DecisionPanelFixturesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DecisionPanelGallery />;
}
