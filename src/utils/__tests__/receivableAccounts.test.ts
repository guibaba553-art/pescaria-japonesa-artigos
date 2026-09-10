import { describe, it, expect } from "vitest";
import { buildAccountReceivables, getSiteReceivableLines } from "@/utils/receivableAccounts";

const day = "2026-09-10";

describe("buildAccountReceivables", () => {
  it("separa dinheiro do PDV da maquininha Stone", () => {
    const pdv = [
      { id: "a", created_at: `${day}T12:00:00Z`, total_amount: 100, payment_method: "cash", installments: 1 },
      { id: "b", created_at: `${day}T13:00:00Z`, total_amount: 200, payment_method: "pix", installments: 1 },
    ];
    const res = buildAccountReceivables(day, pdv, []);
    const cash = res.find(r => r.account === "cash");
    const stone = res.find(r => r.account === "stone");
    expect(cash?.totalGross).toBe(100);
    expect(stone?.totalGross).toBe(200);
  });

  it("separa as vendas do site por gateway", () => {
    const site = [
      { id: "s1", created_at: `${day}T10:00:00`, total_amount: 130, payment_method: "pix", payment_gateway: "mercadopago" },
      { id: "s2", created_at: `${day}T11:00:00`, total_amount: 500, payment_method: "credit_card", payment_gateway: "asaas" },
    ];
    const res = buildAccountReceivables(day, [], site);
    expect(res.find(r => r.account === "mercadopago")?.totalNet).toBe(130);
    expect(res.find(r => r.account === "asaas")?.totalNet).toBe(500);
  });

  it("ignora vendas do site de outro dia", () => {
    const lines = getSiteReceivableLines(day, [
      { id: "s3", created_at: "2026-09-09T10:00:00", total_amount: 90, payment_method: "pix" },
    ]);
    expect(lines).toHaveLength(0);
  });

  it("não retorna contas sem movimento", () => {
    expect(buildAccountReceivables(day, [], [])).toHaveLength(0);
  });
});
