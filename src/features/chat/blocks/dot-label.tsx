import classes from "./blocks.module.css";

/**
 * Cores do Mantine que têm um tom de status na fundação visual (--nexo-color-status-<tom>-*):
 * ponto e texto saem iguais aos do print. As outras ("violet") usam a paleta do Mantine.
 */
const STATUS_TONES: Record<string, string> = {
  yellow: "warning",
  orange: "warning",
  blue: "progress",
  teal: "success",
  green: "success",
  red: "danger",
  gray: "neutral",
};

/** Texto com uma bolinha colorida antes ("• Aguardando analista"), como no protótipo. */
export function DotLabel({
  color,
  colorText = false,
  children,
}: {
  /** Nome de cor do Mantine ("yellow", "teal"...). */
  color: string;
  /** Pinta o texto também (status); senão só a bolinha (prioridade). */
  colorText?: boolean;
  children: React.ReactNode;
}) {
  const tone = STATUS_TONES[color];
  const dotColor = tone
    ? `var(--nexo-color-status-${tone}-dot)`
    : `var(--mantine-color-${color}-6)`;
  const textColor = tone
    ? `var(--nexo-color-status-${tone}-text)`
    : `var(--mantine-color-${color}-7)`;
  return (
    <span className={classes.dotLabel} style={colorText ? { color: textColor } : undefined}>
      <span className={classes.dot} style={{ color: dotColor }} aria-hidden />
      {children}
    </span>
  );
}
