import { Suspense } from "react";

import classes from "@/features/chat/chat.module.css";
import { ChatSidebar } from "@/features/chat/chat-sidebar";

/** Moldura do chat: navegação lateral com o histórico e a área da conversa. */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={classes.shell}>
      {/* A lateral lê o id da conversa aberta (useParams): com Cache Components, vai num Suspense. */}
      <Suspense fallback={<nav className={classes.sidebar} aria-label="Navegação" />}>
        <ChatSidebar />
      </Suspense>
      <main className={classes.main}>{children}</main>
    </div>
  );
}
