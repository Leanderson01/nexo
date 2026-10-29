import { createTheme } from "@mantine/core";

// Referência visual: docs/prototipo. Sans em toda a interface; a serifada
// (--font-serif) aparece só no título da tela de login.
export const theme = createTheme({
  primaryColor: "blue",
  primaryShade: 7,
  fontFamily: "var(--font-sans), system-ui, sans-serif",
  headings: { fontFamily: "var(--font-sans), system-ui, sans-serif" },
  defaultRadius: "md",
});
