"use client";

import { Burger, Drawer } from "@mantine/core";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";

import classes from "./chat.module.css";
import { ChatNavigation, NexoBrand } from "./chat-sidebar";

/**
 * Abaixo de 768 px a lateral some; o menu (☰) no cabeçalho abre a mesma navegação numa
 * gaveta: histórico, "Nova conversa", "Meu perfil" e "Sair".
 */
export function MobileNavigation() {
  const pathname = usePathname();
  // A gaveta fica aberta só na tela em que foi aberta: ao navegar (abrir uma conversa, o
  // perfil, uma conversa nova ou sair), a rota muda e ela fecha sozinha.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const opened = openedAt === pathname;

  return (
    <>
      <Burger
        className={classes.mobileOnly}
        size="sm"
        opened={opened}
        onClick={() => setOpenedAt(opened ? null : pathname)}
        aria-label={opened ? "Fechar menu" : "Abrir menu"}
      />
      <Drawer
        opened={opened}
        onClose={() => setOpenedAt(null)}
        size={280}
        title={<NexoBrand />}
        classNames={{ content: classes.drawerContent, body: classes.drawerBody }}
        closeButtonProps={{ "aria-label": "Fechar menu" }}
      >
        <nav className={classes.drawerNavigation} aria-label="Navegação">
          {/* A navegação lê o id da conversa aberta (useParams): com Cache Components, num Suspense. */}
          <Suspense>
            <ChatNavigation />
          </Suspense>
        </nav>
      </Drawer>
    </>
  );
}
