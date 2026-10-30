import { Stack } from "@mantine/core";

import { ConversationsIcon, ICON_SIZE } from "@/shared/icons";
import classes from "./console.module.css";

/** Área da conversa vazia: nenhuma conversa aberta ainda. */
export function NoConversationSelected() {
  return (
    <div className={classes.emptyMain}>
      <Stack align="center" gap={8}>
        <span className={classes.emptyIcon}>
          <ConversationsIcon size={ICON_SIZE.lg} />
        </span>
        <div className={classes.emptyTitle}>Selecione uma conversa</div>
        <p className={classes.emptyText}>
          A fila mostra primeiro quem espera um atendente, com os casos críticos na frente.
        </p>
      </Stack>
    </div>
  );
}
