"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";

import { ChatConversation, ChatLoading } from "@/features/chat/chat-conversation";
import { ChatErrorBoundary } from "@/features/chat/chat-error-boundary";

/** `/chat/[conversationId]`: uma conversa do funcionário, em tempo real. */
export default function ConversationPage() {
  return (
    // O id só existe na requisição: com Cache Components, `useParams` precisa de um Suspense.
    <Suspense fallback={<ChatLoading />}>
      <ChatErrorBoundary>
        <ConversationFromParams />
      </ChatErrorBoundary>
    </Suspense>
  );
}

function ConversationFromParams() {
  const { conversationId } = useParams<{ conversationId: string }>();
  // A key remonta a tela ao trocar de conversa: rascunho do campo e erros não vazam entre elas.
  return <ChatConversation key={conversationId} conversationId={conversationId} />;
}
