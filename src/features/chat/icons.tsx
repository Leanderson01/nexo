// Ícones feitos à mão que o chat já não usa (ele usa @/shared/icons). Ficam só enquanto o
// console e o perfil ainda importam estes; quando trocarem, o arquivo sai.

export interface IconProps {
  size?: number;
}

export function StrokeIcon({ size = 16, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function ChatBubbleIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
    </StrokeIcon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="m9 6 6 6-6 6" />
    </StrokeIcon>
  );
}

export function ArrowsSwapIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
    </StrokeIcon>
  );
}

export function HeadsetIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M4 14h3v5H5a1 1 0 0 1-1-1v-4ZM20 14h-3v5h2a1 1 0 0 0 1-1v-4Z" />
    </StrokeIcon>
  );
}
