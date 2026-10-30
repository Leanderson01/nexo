// Itens da navegação lateral do funcionário e qual deles fica ativo em cada rota de /chat.

export const CHAT_PATH = "/chat";
export const PROFILE_PATH = "/chat/perfil";

export type ChatNavItem = "attendance" | "profile";

/** "Meu perfil" em `/chat/perfil`; qualquer outra rota de `/chat` é uma tela do atendimento. */
export function activeNavItem(pathname: string): ChatNavItem {
  return pathname === PROFILE_PATH ? "profile" : "attendance";
}
