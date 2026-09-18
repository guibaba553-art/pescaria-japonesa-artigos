import { describe, expect, it } from "vitest";
import { getReceivablePdfAccountCell } from "@/utils/pdvReceivablePdf";

describe("getReceivablePdfAccountCell", () => {
  it.each([
    ["stone", "Stone", [16, 185, 129]],
    ["asaas", "Asaas", [30, 58, 138]],
    ["mercadopago", "Mercado Pago", [56, 189, 248]],
    ["cash", "Dinheiro", [6, 78, 59]],
  ] as const)("identifica %s pelo nome e pela cor", (account, label, color) => {
    expect(getReceivablePdfAccountCell(account)).toEqual({ label, color });
  });
});