// Avisos da fila para o analista (§11.6, T17): badge no título da aba e aviso sonoro opcional
// quando uma conversa nova entra em "Para você". Funções puras, para testar sem a tela.

/**
 * Conversas que entraram na fila desde a lista anterior. Sem lista anterior (a carga da
 * página), nada é "novo": o som não toca ao abrir o console. Uma conversa que sai e volta
 * (devolvida e transferida de novo) conta outra vez.
 */
export function arrivedIds(previous: ReadonlySet<string> | null, current: string[]): string[] {
  if (previous === null) return [];
  return current.filter((id) => !previous.has(id));
}

const BASE_TITLE = "Nexo Assist";

/** Título da aba do navegador: "(3) Nexo Assist" com 3 conversas esperando. */
export function consoleTabTitle(waitingCount: number): string {
  return waitingCount > 0 ? `(${waitingCount}) ${BASE_TITLE}` : BASE_TITLE;
}

/** Chave do `localStorage` com a preferência do som ("on"/"off"; desligado por padrão). */
export const SOUND_STORAGE_KEY = "nexo.console.arrivalSound";
