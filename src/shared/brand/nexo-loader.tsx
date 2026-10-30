import { useId } from "react";

import classes from "./nexo-loader.module.css";

// Mesmo desenho do NexoMark (src/features/auth/login/icons.tsx): o contorno recorta o traço.
const MARK_PATH = "M1.5 3h6l9 11.5V3h6v18h-6l-9-11.5V21h-6z";
// Eixo do "N": sobe a perna esquerda, desce a diagonal, sobe a perna direita.
const STROKE_PATH = "M4.5 21V3L19.5 21V3";

type NexoLoaderProps = {
  /**
   * `content`: centralizado na área da página, aparecendo só depois de ~180 ms de espera.
   * `fullScreen`: centralizado na janela, sem atraso (carregamento completo da página).
   */
  placement?: "content" | "fullScreen";
  size?: number;
};

/** Espera com a marca: o "N" do Nexo sendo desenhado em loop (parado com movimento reduzido). */
export function NexoLoader({ placement = "content", size = 40 }: NexoLoaderProps) {
  // O id do recorte vai num url(#...): fica só com caracteres seguros.
  const clipId = `nexo-loader-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const placementClass = placement === "fullScreen" ? classes.fullScreen : classes.delayed;

  return (
    <div role="status" className={`${classes.root} ${placementClass}`}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <defs>
          <clipPath id={clipId}>
            <path d={MARK_PATH} />
          </clipPath>
        </defs>
        <path d={MARK_PATH} className={classes.base} />
        <path
          d={STROKE_PATH}
          pathLength={1}
          className={classes.stroke}
          clipPath={`url(#${clipId})`}
        />
      </svg>
      <span className={classes.label}>Carregando…</span>
    </div>
  );
}
