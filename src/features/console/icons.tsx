import { StrokeIcon, type IconProps } from "@/features/chat/icons";

// Ícones do console no mesmo traço dos do chat (sem biblioteca de ícones).

export function SearchIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </StrokeIcon>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" />
    </StrokeIcon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" />
    </StrokeIcon>
  );
}

export function HandIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v7.5" />
      <path d="M17 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.6-2.2L4.6 15a1.5 1.5 0 0 1 2.3-1.9L8 14.5" />
    </StrokeIcon>
  );
}

export function ReturnIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </StrokeIcon>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 12 2 2 4-4" />
    </StrokeIcon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </StrokeIcon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="m15 18-6-6 6-6" />
    </StrokeIcon>
  );
}

export function TicketIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V7Z" />
      <path d="M13 5v2M13 11v2M13 17v2" />
    </StrokeIcon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9v6M14 9v6" />
    </StrokeIcon>
  );
}
