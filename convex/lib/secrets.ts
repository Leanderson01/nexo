// Comparação de segredos (AGENT_SERVER_SECRET, TICKETING_SERVICE_KEY, EVALS_SECRET).
//
// `a === b` para no primeiro caractere diferente, então o tempo da resposta conta a quem
// tenta adivinhar quantos caracteres do começo acertou. Aqui o laço percorre sempre o
// segredo esperado inteiro e só acumula as diferenças (XOR, juntadas com OR): o tempo
// depende do tamanho do segredo, não de onde está o erro.
// O runtime padrão do Convex não tem o `crypto.timingSafeEqual` do Node, daí o laço à mão.

const encoder = new TextEncoder();

/** true só se `received` for igual a `expected`, comparando em tempo constante. */
export function secretsMatch(received: string, expected: string): boolean {
  const receivedBytes = encoder.encode(received);
  const expectedBytes = encoder.encode(expected);

  // Tamanho diferente já é diferença, mas o laço roda igual para não encurtar o tempo.
  let difference = receivedBytes.length ^ expectedBytes.length;
  for (let index = 0; index < expectedBytes.length; index++) {
    difference |= (receivedBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }
  return difference === 0;
}
