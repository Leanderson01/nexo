// Ponto único de ícones do app: Lucide (lucide-react), o conjunto de traço fino e cantos
// arredondados dos prints. Os nomes descrevem o uso no app; o mapa "ícone do print -> ícone
// daqui" está em docs/design/fundacao-visual.md. Tamanho e traço padrão vêm do IconProvider.

export type { LucideIcon as Icon, LucideProps as IconProps } from "lucide-react";
export { IconProvider } from "./icon-provider";
export { ICON_SIZE, ICON_STROKE } from "./sizes";

export {
  // navegação e estrutura
  MessageSquare as ChatIcon,
  MessageCircle as ConversationsIcon,
  User as UserIcon,
  LogOut as LogoutIcon,
  ChevronRight as ChevronRightIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronDown as ChevronDownIcon,
  X as CloseIcon,
  EllipsisVertical as MoreIcon,
  Plus as PlusIcon,
  Search as SearchIcon,
  ListFilter as FilterIcon,
  ArrowUpRight as ExternalLinkIcon,
  // formulário e conta
  Mail as MailIcon,
  Lock as LockIcon,
  LockKeyhole as PasswordIcon, // campo de senha do login (cadeado com fechadura)
  KeyRound as KeyIcon,
  RotateCcwKey as ResetPasswordIcon,
  Eye as EyeIcon,
  EyeOff as EyeOffIcon,
  ArrowRight as ArrowRightIcon,
  // conversa
  ArrowUp as SendIcon,
  SendHorizontal as SendMessageIcon,
  Check as CheckIcon,
  CheckCheck as ReadReceiptIcon,
  Clock as SendingIcon, // reloginho da mensagem que ainda não foi salva
  BookOpen as ArticleIcon,
  Ticket as TicketIcon,
  // atendimento
  Headset as HeadsetIcon,
  Bot as AgentIcon,
  Hand as HandIcon,
  ArrowRightLeft as TransferIcon,
  Undo2 as ReturnIcon,
  CircleCheckBig as EndIcon,
  Pause as PauseIcon,
  Bell as BellIcon,
  BellOff as BellOffIcon,
  ChartColumn as ChartIcon,
  // voz
  Mic as MicrophoneIcon,
  Volume2 as SpeakerIcon,
  Square as StopIcon,
} from "lucide-react";
