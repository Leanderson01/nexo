import { ChatErrorBoundary } from "@/features/chat/chat-error-boundary";
import { OpenLatestConversation } from "@/features/chat/open-latest-conversation";

/** `/chat`: abre a última conversa não encerrada ou começa uma nova (§7.2, F6). */
export default function ChatPage() {
  return (
    <ChatErrorBoundary>
      <OpenLatestConversation />
    </ChatErrorBoundary>
  );
}
