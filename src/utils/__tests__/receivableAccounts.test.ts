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

describe("parcelas de vendas do site", () => {
  const order = {
    id: "s6",
    created_at: "2026-09-10T09:34:00",
    total_amount: 508.72,
    payment_method: "credit_card",
    payment_gateway: "asaas",
    installments: 6,
  };

  it("primeira parcela entra na data da venda", () => {
    const lines = getSiteReceivableLines("2026-09-10", [order]);
    expect(lines).toHaveLength(1);
    expect(lines[0].parcelIndex).toBe(1);
    expect(lines[0].parcelCount).toBe(6);
    expect(lines[0].gross).toBeCloseTo(84.78, 2);
  });

  it("parcelas seguintes caem no mesmo dia dos meses seguintes", () => {
    expect(getSiteReceivableLines("2026-10-10", [order])[0].parcelIndex).toBe(2);
    expect(getSiteReceivableLines("2027-02-10", [order])[0].parcelIndex).toBe(6);
    expect(getSiteReceivableLines("2026-09-11", [order])).toHaveLength(0);
  });

  it("a soma das parcelas fecha o valor total", () => {
    const dates = ["2026-09-10", "2026-10-10", "2026-11-10", "2026-12-10", "2027-01-10", "2027-02-10"];
    const sum = dates.reduce((s, d) => s + getSiteReceivableLines(d, [order])[0].gross, 0);
    expect(sum).toBeCloseTo(508.72, 2);
  });
});
