import { describe, expect, test } from "vitest";

import { arrivedIds, consoleTabTitle } from "../queue-alerts";

describe("arrivedIds", () => {
  test("na carga da página nada é novo: o som não toca ao abrir o console", () => {
    expect(arrivedIds(null, ["a", "b"])).toEqual([]);
  });

  test("só o que não estava na lista anterior", () => {
    expect(arrivedIds(new Set(["a"]), ["b", "a", "c"])).toEqual(["b", "c"]);
    expect(arrivedIds(new Set(["a", "b"]), ["a"])).toEqual([]);
  });

  test("conversa que saiu e voltou para a fila conta de novo", () => {
    const afterAssign = new Set<string>([]);
    expect(arrivedIds(afterAssign, ["a"])).toEqual(["a"]);
  });
});

describe("consoleTabTitle", () => {
  test("mostra quantas conversas esperam; sem nenhuma, o título normal", () => {
    expect(consoleTabTitle(3)).toBe("(3) Nexo Assist");
    expect(consoleTabTitle(0)).toBe("Nexo Assist");
  });
});
