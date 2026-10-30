import {
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  createTheme,
  Input,
  InputWrapper,
  Paper,
  rem,
  type MantineSize,
} from "@mantine/core";

import { amber, blue, controlSizes, dark, gray, green, radius, red, shadows } from "./tokens";

// Referência visual: docs/prototipo; valores e critérios em docs/design/fundacao-visual.md.
// Inter em toda a interface; a serifada Newsreader (--font-serif) só nos títulos do login.

const SANS = "var(--font-sans), system-ui, sans-serif";

/** Altura e fonte de um controle (botão ou input) para um `size` do Mantine, se for um dos nossos. */
function controlVars(size: MantineSize | string | undefined, prefix: "button" | "input") {
  const control = controlSizes[(size ?? "sm") as keyof typeof controlSizes];
  if (!control) return {};
  return {
    [`--${prefix}-height`]: rem(control.height),
    [`--${prefix}-fz`]: rem(control.fontSize),
  };
}

export const theme = createTheme({
  colors: { blue, gray, dark, green, red, orange: amber, yellow: amber },
  primaryColor: "blue",
  primaryShade: 7,
  black: gray[9],
  white: "#ffffff",

  fontFamily: SANS,
  fontSizes: {
    xs: rem(12), // rótulos de campo, "consultou seus chamados", contador, horários
    sm: rem(13), // breadcrumb, botões, chips, prévias da lista, descrições
    md: rem(14), // corpo: balões, valores, subtítulo de página
    lg: rem(15), // nomes na lista e no cabeçalho, títulos de painel, subtítulo do login
    xl: rem(18), // título de card (rascunho, chamado)
  },
  lineHeights: { xs: "1.4", sm: "1.45", md: "1.55", lg: "1.5", xl: "1.4" },
  fontWeights: { regular: "400", medium: "500", bold: "600" },
  headings: {
    fontFamily: SANS,
    fontWeight: "600",
    textWrap: "pretty",
    sizes: {
      h1: { fontSize: rem(24), lineHeight: "1.25", fontWeight: "700" }, // "Meu perfil"
      h2: { fontSize: rem(20), lineHeight: "1.3" }, // "Conversas"
      h3: { fontSize: rem(18), lineHeight: "1.35" }, // título de card
      h4: { fontSize: rem(15), lineHeight: "1.4" }, // "Chamados da Ana", "Nexo Assist"
      h5: { fontSize: rem(14), lineHeight: "1.45" }, // "Senha", "Quem está sendo afetado?"
      h6: { fontSize: rem(13), lineHeight: "1.45" },
    },
  },

  spacing: { xs: rem(8), sm: rem(12), md: rem(16), lg: rem(24), xl: rem(32) },
  radius: {
    xs: rem(radius.xs),
    sm: rem(radius.sm),
    md: rem(radius.md),
    lg: rem(radius.lg),
    xl: rem(radius.xl),
  },
  defaultRadius: "sm",
  shadows: {
    xs: "0 1px 2px rgb(27 36 49 / 5%)",
    sm: shadows.card,
    md: shadows.overlay,
    lg: shadows.overlay,
    xl: shadows.overlay,
  },

  components: {
    Button: Button.extend({
      vars: (_theme, props) => ({ root: controlVars(props.size, "button") }),
      styles: { root: { fontWeight: 500 } },
    }),
    Input: Input.extend({
      vars: (_theme, props) => ({ wrapper: controlVars(props.size, "input") }),
      // Borda clara do print. Fica no wrapper: o foco e o erro redefinem a variável no próprio
      // <input> e continuam valendo.
      styles: { wrapper: { "--input-bd": "var(--nexo-color-border)" } },
    }),
    InputWrapper: InputWrapper.extend({
      styles: {
        label: { fontSize: rem(13), fontWeight: 500, marginBottom: rem(6) },
        description: { color: "var(--nexo-color-text-secondary)" },
      },
    }),
    Card: Card.extend({
      defaultProps: { radius: "lg", padding: "md", withBorder: true, shadow: "sm" },
    }),
    Paper: Paper.extend({ defaultProps: { radius: "lg" } }),
    Badge: Badge.extend({
      defaultProps: { radius: "xl" },
      vars: (_theme, props) =>
        props.size === undefined || props.size === "md"
          ? {
              root: {
                "--badge-height": rem(24),
                "--badge-fz": rem(12),
                "--badge-padding-x": rem(10),
              },
            }
          : { root: {} },
      styles: { root: { textTransform: "none", fontWeight: 500, letterSpacing: 0 } },
    }),
    Checkbox: Checkbox.extend({ defaultProps: { radius: "xs" } }),
    Anchor: Anchor.extend({
      defaultProps: { underline: "hover" },
      styles: { root: { fontWeight: 500 } },
    }),
  },
});
