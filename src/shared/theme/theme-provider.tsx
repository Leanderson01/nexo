"use client";

import { MantineProvider } from "@mantine/core";

import { cssVariablesResolver } from "./css-variables";
import { theme } from "./theme";

// O tema usa `Button.extend` e funções (vars), que só existem no cliente: por isso o
// MantineProvider fica neste componente de cliente, e não direto no layout (servidor).
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="light"
    >
      {children}
    </MantineProvider>
  );
}
