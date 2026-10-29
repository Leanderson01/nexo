// Checagem em tempo de compilação de que dois tipos são idênticos. Usada para manter
// os validators do Convex e os schemas Zod alinhados aos tipos de src/domain.
export type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export function assertTypesMatch<Check extends true>(): Check | undefined {
  return undefined;
}
