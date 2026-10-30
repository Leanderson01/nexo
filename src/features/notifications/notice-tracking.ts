// Quando uma atualização do suporte vira toast (§11.6). Puro, para testar sem a tela.

/**
 * A atualização mais recente é nova se a tela já tem uma base (`seenId` não é undefined) e o
 * id mudou. Sem base (a primeira leitura, ao abrir o chat) nada é novo.
 */
export function isNewNotice(seenId: string | null | undefined, latestId: string | null): boolean {
  if (seenId === undefined || latestId === null) return false;
  return latestId !== seenId;
}
