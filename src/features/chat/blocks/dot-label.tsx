import classes from "./blocks.module.css";

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
  const shade = `var(--mantine-color-${color}-7)`;
  return (
    <span className={classes.dotLabel} style={colorText ? { color: shade } : undefined}>
      <span className={classes.dot} style={{ color: shade }} aria-hidden />
      {children}
    </span>
  );
}
