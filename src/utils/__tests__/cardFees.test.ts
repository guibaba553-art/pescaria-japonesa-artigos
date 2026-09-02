import { describe, it, expect } from "vitest";
import { getCardFeeRate, applyCardFee } from "@/utils/cardFees";

describe("cardFees", () => {
  it("pix cobra 0,75%", () => {
    expect(getCardFeeRate("pix")).toBeCloseTo(0.0075, 6);
    expect(applyCardFee(100, "pix")).toBeCloseTo(99.25, 6);
  });

  it("dinheiro não tem taxa", () => {
    expect(getCardFeeRate("dinheiro")).toBe(0);
  });

  it("débito e crédito mantêm as taxas da maquininha", () => {
    expect(getCardFeeRate("debito")).toBeCloseTo(0.0106, 6);
    expect(getCardFeeRate("credito", 1)).toBeCloseTo(0.023, 6);
    expect(getCardFeeRate("credito", 3)).toBeCloseTo(0.0273, 6);
    expect(getCardFeeRate("credito", 10)).toBeCloseTo(0.028, 6);
  });
});
