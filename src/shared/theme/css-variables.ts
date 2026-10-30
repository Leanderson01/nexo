import type { CSSVariablesResolver } from "@mantine/core";

import { avatarColors, radius, semanticColors, shadows } from "./tokens";

// Variáveis CSS do app (--nexo-*), geradas a partir de tokens.ts para os CSS modules das telas
// usarem nomes semânticos em vez de hex. Também ajusta algumas variáveis do Mantine ao print.

/** Variante `light` (fundo claro + texto do tom): no print o fundo é o tom 0 e o texto, o 7 ou 8. */
const LIGHT_VARIANT_TEXT_SHADE = {
  blue: 7,
  gray: 7,
  green: 8,
  red: 7,
  orange: 8,
  yellow: 8,
} as const;

function prefixed(prefix: string, values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [`--nexo-${prefix}-${name}`, value]),
  );
}

function lightVariantVariables() {
  return Object.fromEntries(
    Object.entries(LIGHT_VARIANT_TEXT_SHADE).flatMap(([color, shade]) => [
      [`--mantine-color-${color}-light`, `var(--mantine-color-${color}-0)`],
      [`--mantine-color-${color}-light-hover`, `var(--mantine-color-${color}-1)`],
      [`--mantine-color-${color}-light-color`, `var(--mantine-color-${color}-${shade})`],
    ]),
  );
}

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    ...prefixed("color", semanticColors),
    ...prefixed("radius", {
      control: `${radius.sm}px`,
      card: `${radius.lg}px`,
      bubble: `${radius.lg}px`,
      "bubble-tail": `${radius.xs}px`,
      pill: "999px",
    }),
    ...prefixed("shadow", shadows),
    ...Object.fromEntries(
      avatarColors.flatMap((color, index) => [
        [`--nexo-avatar-${index}-bg`, color.bg],
        [`--nexo-avatar-${index}-text`, color.text],
      ]),
    ),
    // Serifada do login (Newsreader): título grande, "Entrar" e os números do rodapé.
    "--nexo-font-size-display": "48px",
    "--nexo-font-size-display-sm": "36px",
    "--nexo-font-size-stat": "32px",
  },
  light: {
    "--mantine-color-default-border": semanticColors.border,
    "--mantine-color-placeholder": semanticColors["text-secondary"],
    "--mantine-color-anchor": semanticColors.primary,
    ...lightVariantVariables(),
  },
  dark: {},
});
