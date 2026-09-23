import { describe, it, expect } from "vitest";
import { pickRandom } from "../randomPick";

describe("pickRandom", () => {
  it("retorna no máximo `count` itens", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(pickRandom(items, 4)).toHaveLength(4);
  });

  it("retorna todos quando há menos itens que `count`", () => {
    expect(pickRandom([1, 2], 4)).toHaveLength(2);
  });

  it("não muta o array original nem repete itens", () => {
    const items = ["a", "b", "c", "d", "e", "f"];
    const before = [...items];
    const picked = pickRandom(items, 4);
    expect(items).toEqual(before);
    expect(new Set(picked).size).toBe(picked.length);
  });

  it("embaralha: em muitas execuções a ordem varia", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(pickRandom(items, 4).join(","));
    expect(seen.size).toBeGreaterThan(1);
  });
});
