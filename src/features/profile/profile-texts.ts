// Textos da tela "Meu perfil" (docs/prototipo/04-perfil.png).

/**
 * O protótipo mostra "Alterada há 42 dias", mas o sistema não guarda quando a senha mudou.
 * Em vez de inventar uma data, a tela diz o que é verdade: é a senha da rede (como no login).
 */
export const PASSWORD_DESCRIPTION = "A mesma da rede Nexo";

export function passwordResetNotice(email: string): string {
  return `Enviaremos um link de redefinição para ${email}.`;
}
