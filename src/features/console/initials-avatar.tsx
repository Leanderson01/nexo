import classes from "./console.module.css";
import { avatarColorIndex, initials } from "./console-texts";

/** Avatar de iniciais com o par de cores da fundação (`--nexo-avatar-N`), fixo por nome. */
export function InitialsAvatar({
  name,
  size,
  colorIndex = avatarColorIndex(name),
}: {
  name: string;
  /** 32 no trilho, 40 no cabeçalho, 44 na fila. */
  size: 32 | 40 | 44;
  colorIndex?: number;
}) {
  return (
    <span
      className={classes.avatar}
      data-size={size}
      style={{
        background: `var(--nexo-avatar-${colorIndex}-bg)`,
        color: `var(--nexo-avatar-${colorIndex}-text)`,
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
