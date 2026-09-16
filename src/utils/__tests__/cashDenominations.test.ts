import { describe, it, expect } from "vitest";
import {
  sumDenominations,
  countPieces,
  CASH_DENOMINATIONS,
  compactDenominationCounts,
  getDenominationBreakdown,
} from "../cashDenominations";

describe("cashDenominations", () => {
  it("soma zero quando nada informado", () => {
    expect(sumDenominations({})).toBe(0);
    expect(countPieces({})).toBe(0);
  });

  it("soma cédulas e moedas", () => {
    const counts = { "100": 2, "50": 1, "2": 3, "0.5": 2, "0.05": 3 };
    expect(sumDenominations(counts)).toBeCloseTo(257.15, 2);
    expect(countPieces(counts)).toBe(11);
  });

  it("aceita strings e ignora inválidos", () => {
    expect(sumDenominations({ "20": "3", "10": "", "5": "abc", "1": -2 })).toBe(60);
  });

  it("cobre todas as denominações do real", () => {
    expect(CASH_DENOMINATIONS.map((d) => d.value)).toEqual([
      200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05,
    ]);
  });

  it("salva apenas quantidades inteiras e positivas", () => {
    expect(compactDenominationCounts({
      "100": "2",
      "20": "0",
      "5": "3.9",
      "1": "inválido",
    })).toEqual({ "100": 2, "5": 3 });
  });

  it("monta o detalhamento somente das cédulas e moedas informadas", () => {
    expect(getDenominationBreakdown({ "100": 2, "0.5": 3 })).toEqual([
      { label: "R$ 100", quantity: 2, subtotal: 200 },
      { label: "R$ 0,50", quantity: 3, subtotal: 1.5 },
    ]);
  });
});
