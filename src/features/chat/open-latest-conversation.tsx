"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { api } from "../../../convex/_generated/api";
import { ChatConversation, ChatLoading } from "./chat-conversation";

/**
 * `/chat` (F6): abre a última conversa não encerrada. Sem nenhuma, mostra a conversa nova,
 * que só é criada no primeiro envio.
 */
export function OpenLatestConversation() {
  const router = useRouter();
  const conversations = useQuery(api.conversations.listMine);
  const latestOpenId = conversations?.find((c) => c.status !== "closed")?._id;

  useEffect(() => {
    if (latestOpenId) router.replace(`/chat/${latestOpenId}`);
  }, [latestOpenId, router]);

  // Enquanto decide (ou redireciona), mostra a conversa carregando, sem piscar o estado vazio.
  if (conversations === undefined || latestOpenId) return <ChatLoading />;
  return <ChatConversation conversationId={null} />;
}
