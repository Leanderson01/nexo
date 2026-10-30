// Logotipo do Nexo (o "N" sólido). Não é um ícone do conjunto: os ícones das telas vêm de
// @/shared/icons. Também aparece na barra lateral do chat e no console.

/** Marca do Nexo: um "N" sólido, mais largo que alto, como nos prints. */
export function NexoMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M1.5 3h6l9 11.5V3h6v18h-6l-9-11.5V21h-6z" fill="currentColor" />
    </svg>
  );
}
