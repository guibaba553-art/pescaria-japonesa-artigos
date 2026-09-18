import { describe, it, expect } from "vitest";
import { buildGeneralReceivable } from "@/utils/receivableAccounts";

const day = "2026-10-01";

describe("buildGeneralReceivable", () => {
  it("soma todas as contas do dia (Stone, Asaas, Mercado Pago, Dinheiro)", () => {
    const pdv = [
      { id: "a", created_at: `${day}T12:00:00Z`, total_amount: 100, payment_method: "cash", installments: 1 },
      { id: "b", created_at: `${day}T13:00:00Z`, total_amount: 200, payment_method: "pix", installments: 1 },
    ];
    const site = [
      { id: "s1", created_at: `${day}T10:00:00`, total_amount: 130, payment_method: "pix", payment_gateway: "mercadopago", installments: 1 },
      { id: "s2", created_at: `${day}T11:00:00`, total_amount: 500, payment_method: "credit_card", payment_gateway: "asaas", installments: 1 },
    ];
    const general = buildGeneralReceivable(day, pdv, site);
    expect(general).not.toBeNull();
    expect(general!.lines).toHaveLength(4);
    expect(general!.totalGross).toBeCloseTo(930, 2);
    const accounts = general!.accounts.map(a => a.account);
    expect(accounts).toEqual(["stone", "mercadopago", "asaas", "cash"]);
    const sumNet = general!.accounts.reduce((s, a) => s + a.totalNet, 0);
    expect(general!.totalNet).toBeCloseTo(sumNet, 2);
  });

  it("retorna null quando não há movimento", () => {
    expect(buildGeneralReceivable(day, [], [])).toBeNull();
  });
});
