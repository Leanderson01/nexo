// "Manter conectado": o login grava este cookie e o proxy escolhe a duração dos cookies
// de sessão do Convex Auth a partir dele (30 dias, ou até fechar o navegador).

export const REMEMBER_ME_COOKIE = "nexo-remember";
export const REMEMBER_ME_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Só no navegador: chame antes do signIn. */
export function saveRememberMePreference(remember: boolean): void {
  document.cookie = remember
    ? `${REMEMBER_ME_COOKIE}=1; path=/; max-age=${REMEMBER_ME_MAX_AGE_SECONDS}; samesite=lax`
    : `${REMEMBER_ME_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
