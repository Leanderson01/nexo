// Resultado de operações com erro esperado (regra de negócio, legado fora do ar).
// Exceções ficam para o que é realmente inesperado.
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
