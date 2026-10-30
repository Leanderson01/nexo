import classes from "./console.module.css";
import type { StatusTone } from "./console-texts";

/**
 * Texto com o ponto de status na frente ("• Aguardando analista"), nas cores da fundação
 * visual. Sem `colorText`, só o ponto leva a cor e o texto fica secundário.
 */
export function StatusLabel({
  tone,
  colorText = true,
  children,
}: {
  tone: StatusTone;
  colorText?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className={classes.statusLabel} data-tone={tone} data-color-text={colorText || undefined}>
      <span className={classes.statusDot} aria-hidden />
      {children}
    </span>
  );
}
