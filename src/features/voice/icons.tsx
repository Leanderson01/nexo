import { StrokeIcon, type IconProps } from "../chat/icons";

// Ícones da voz, no mesmo traço dos ícones do chat.

export function MicrophoneIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </StrokeIcon>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
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

export function SpeakerIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
    </StrokeIcon>
  );
}
