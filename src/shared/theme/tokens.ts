import type { MantineColorsTuple } from "@mantine/core";

// Valores extraídos dos prints de docs/prototipo (capturas de 1440 px reduzidas para ~889 px:
// cada pixel do print vale ~1,62 px reais). Cores amostradas no pixel; as medidas, convertidas
// para px reais e arredondadas para a grade de 4 px. Origem e critérios em
// docs/design/fundacao-visual.md.

// --- Paletas de 10 tons (substituem as do Mantine; os índices usados nas telas ficam iguais ao print)

/** Azul da marca. 7 = botões, links e item ativo; 0 = fundo do item ativo e do chip selecionado. */
export const blue: MantineColorsTuple = [
  "#edf6fe",
  "#dce9f7",
  "#b9d5f2",
  "#8fbcec",
  "#5aa2e6",
  "#0285f7",
  "#0074df",
  "#0062c4",
  "#00529f",
  "#00407d",
];

/** Cinzas levemente azulados. 9 = texto principal; 6 = texto secundário; 2 = borda; 0 = superfície sutil. */
export const gray: MantineColorsTuple = [
  "#f6f7f9",
  "#eef1f5",
  "#e2e5ea",
  "#ced3da",
  "#b4bac3",
  "#848b95",
  "#5b6472",
  "#3d4656",
  "#2a3240",
  "#1b2431",
];

/** Tons escuros (usados em `c="dark.N"`): 7 = texto principal, igual ao painel escuro do login. */
export const dark: MantineColorsTuple = [
  "#c9ced6",
  "#b4bac3",
  "#959ca7",
  "#848b95",
  "#5b6472",
  "#3d4656",
  "#2a3240",
  "#1b2431",
  "#141b26",
  "#0e141d",
];

/** Verde: 6 = ponto "Aprovado"/online; 8 = texto "Assistente online"; 1 = balão do analista. */
export const green: MantineColorsTuple = [
  "#ebfaf3",
  "#e3f4ea",
  "#c5ead6",
  "#9adbb9",
  "#5fc996",
  "#2fc985",
  "#00bd6c",
  "#00a05c",
  "#00804a",
  "#00633a",
];

/** Vermelho: 6 = ponto "Transferida"; 7 = texto "Transferida" e "Encerrar"; 0 = fundo do Encerrar. */
export const red: MantineColorsTuple = [
  "#fef1f1",
  "#fde0e1",
  "#f9bfc1",
  "#f4979a",
  "#f16a6f",
  "#ef4c52",
  "#ee343b",
  "#c4161d",
  "#a51118",
  "#820d13",
];

/**
 * Âmbar: 6 = ponto "Aguardando analista" e prioridade alta; 8 = texto "Aguardando confirmação",
 * "há 5 dias", "Agent pediu ajuda"; 0 = fundo do selo "Aguardando atendente". No print o
 * "laranja" e o "âmbar" são a mesma família, por isso `orange` e `yellow` usam esta paleta.
 */
export const amber: MantineColorsTuple = [
  "#fef7e7",
  "#fdedc6",
  "#fbdc8f",
  "#f9ca58",
  "#f7b92e",
  "#f6ae14",
  "#f5a500",
  "#c48400",
  "#946300",
  "#6e4a00",
];

// --- Cores semânticas (viram variáveis CSS --nexo-color-*; ver css-variables.ts)

export const semanticColors = {
  text: gray[9],
  "text-secondary": gray[6],
  "text-tertiary": gray[5],
  "text-nav": gray[7],
  "text-on-primary": "#ffffff",
  "text-on-dark": "#ffffff",
  "text-on-dark-secondary": "#b6bcc5",
  "text-on-dark-tertiary": "#8f97a3",

  surface: "#ffffff",
  "surface-subtle": gray[0],
  "surface-sunken": gray[1],
  "surface-dark": gray[9],
  "surface-dark-raised": "#242d39",
  "surface-dark-overlay": "#353d49",

  border: gray[2],
  "border-strong": gray[3],
  "border-on-dark": "rgb(255 255 255 / 10%)",

  primary: blue[7],
  "primary-hover": blue[8],
  "primary-subtle": blue[0],
  "primary-muted": blue[1],
  "primary-border": blue[3],

  "bubble-user": gray[9],
  "bubble-user-text": "#ffffff",
  "bubble-agent": "#ffffff",
  "bubble-agent-console": "#e6effa",
  "bubble-analyst": green[1],
  "bubble-customer": "#ffffff",
  "tag-team": "#dbedea",
  "tag-team-text": green[8],

  "status-warning-dot": amber[6],
  "status-warning-text": amber[8],
  "status-warning-bg": amber[0],
  "status-progress-dot": blue[5],
  "status-progress-text": blue[7],
  "status-progress-bg": blue[0],
  "status-success-dot": green[6],
  "status-success-text": green[8],
  "status-success-bg": green[0],
  "status-danger-dot": red[6],
  "status-danger-text": red[7],
  "status-danger-bg": red[0],
  "status-neutral-dot": gray[4],
  "status-neutral-text": gray[6],
  "status-neutral-bg": gray[0],
} as const;

/** Avatares de iniciais: fundo pastel e texto escuro do mesmo tom (lista de conversas do console). */
export const avatarColors = [
  { bg: "#dce9f7", text: "#0062c4" },
  { bg: "#f6e3d3", text: "#9a4a12" },
  { bg: "#e6e1f7", text: "#5b3fc4" },
  { bg: "#ddf0e6", text: "#1e7a4c" },
  { bg: "#f7e1e6", text: "#a3324f" },
  { bg: "#e5e8ec", text: "#3d4656" },
  { bg: "#fbefd0", text: "#8a6100" },
] as const;

// --- Formas e medidas (px reais)

export const radius = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16 } as const;

/**
 * Alturas e fontes de botões e inputs por `size` do Mantine. sm é o padrão (botões e inputs do
 * app, 36 px); xs, os chips de resposta e filtros (32 px); lg, o login (44 px).
 */
export const controlSizes = {
  xs: { height: 32, fontSize: 12 },
  sm: { height: 36, fontSize: 13 },
  md: { height: 40, fontSize: 14 },
  lg: { height: 44, fontSize: 14 },
} as const;

export const shadows = {
  /** Cards do rascunho, do chamado e do perfil: sombra curta e bem clara. */
  card: "0 1px 2px rgb(27 36 49 / 4%), 0 4px 12px rgb(27 36 49 / 5%)",
  /** Popovers e menus. */
  overlay: "0 2px 4px rgb(27 36 49 / 6%), 0 12px 32px rgb(27 36 49 / 12%)",
  /** Botão principal do login ("Entrar"): halo azul embaixo. */
  primary: "0 4px 14px rgb(0 98 196 / 22%)",
} as const;
