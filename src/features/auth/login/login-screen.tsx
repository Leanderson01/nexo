import { Anchor, Box, Text } from "@mantine/core";

import { LoginForm } from "./login-form";
import { LoginShowcase } from "./login-showcase";
import classes from "./login.module.css";

/** Tela 1 (§7.1, protótipo 01-login.png). */
export function LoginScreen() {
  return (
    <main className={classes.screen}>
      <LoginShowcase />

      <section className={classes.formSide}>
        <div className={classes.formTopBar}>
          <Text size="sm" c="dimmed">
            Problema para entrar?{" "}
            <Anchor href="tel:4000" size="sm" fw={600}>
              Ligue no ramal 4000
            </Anchor>
          </Text>
        </div>

        <div className={classes.formCenter}>
          {/* No celular o painel escuro some; a apresentação vem em duas linhas. */}
          <Box hiddenFrom="md" className={classes.form} mb="xl">
            <Text fw={700}>Nexo Assist</Text>
            <Text size="sm" c="dimmed">
              Service desk de TI da Nexo: descreva o problema e o assistente consulta seus chamados,
              busca na central de ajuda e chama um analista quando precisa.
            </Text>
          </Box>
          <LoginForm />
        </div>

        <footer className={classes.footer}>
          <Text size="xs" c="dimmed">
            © 2026 Nexo · Service desk de TI
          </Text>
          <Text size="xs" c="dimmed">
            Privacidade e uso de dados
          </Text>
        </footer>
      </section>
    </main>
  );
}
