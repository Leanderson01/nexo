"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";

import { ConsoleConversation } from "@/features/console/console-conversation";
import { ConsoleErrorBoundary } from "@/features/console/console-error-boundary";

/** `/console/[conversationId]`: a conversa transferida, em tempo real. */
export default function ConsoleConversationPage() {
  return (
    // O id só existe na requisição: com Cache Components, `useParams` precisa de um Suspense.
    <Suspense fallback={null}>
      <ConsoleErrorBoundary>
        <ConversationFromParams />
      </ConsoleErrorBoundary>
    </Suspense>
  );
}

function ConversationFromParams() {
  const { conversationId } = useParams<{ conversationId: string }>();
  // A key remonta a tela ao trocar de conversa: campo e diálogos não vazam entre elas.
  return <ConsoleConversation key={conversationId} conversationId={conversationId} />;
}
