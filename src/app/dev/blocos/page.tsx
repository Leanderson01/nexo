import { notFound } from "next/navigation";

import { BlockFixtures } from "@/features/chat/blocks/block-fixtures";

/** Vitrine dos blocos do chat com dados falsos. Só existe em desenvolvimento. */
export default function BlockFixturesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BlockFixtures />;
}
