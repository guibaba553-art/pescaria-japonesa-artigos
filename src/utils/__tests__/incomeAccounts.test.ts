import { describe, it, expect } from "vitest";
import { classifyIncomeAccount } from "@/utils/incomeAccounts";

describe("classifyIncomeAccount", () => {
  it("manda vendas do PDV em cartão/pix para a Stone", () => {
    expect(classifyIncomeAccount({ source: "pdv", payment_method: "credit" })).toBe("stone");
    expect(classifyIncomeAccount({ source: "pdv", payment_method: "debit" })).toBe("stone");
    expect(classifyIncomeAccount({ source: "pdv", payment_method: "pix" })).toBe("stone");
  });

  it("separa dinheiro em um caixa próprio", () => {
    expect(classifyIncomeAccount({ source: "pdv", payment_method: "cash" })).toBe("cash");
    expect(classifyIncomeAccount({ source: "pdv", payment_method: "dinheiro" })).toBe("cash");
    expect(classifyIncomeAccount({ source: "site", payment_method: "cash" })).toBe("cash");
  });

  it("usa o gateway registrado nas vendas do site", () => {
    expect(classifyIncomeAccount({ source: "site", payment_method: "pix", payment_gateway: "mercadopago" })).toBe("mercadopago");
    expect(classifyIncomeAccount({ source: "site", payment_method: "credit_card", payment_gateway: "asaas" })).toBe("asaas");
    expect(classifyIncomeAccount({ source: "site", payment_method: "pix", payment_gateway: "asaas" })).toBe("asaas");
  });

  it("sem gateway, roteia pix para Mercado Pago e cartão para Asaas", () => {
    expect(classifyIncomeAccount({ source: "site", payment_method: "pix" })).toBe("mercadopago");
    expect(classifyIncomeAccount({ source: "site", payment_method: "credit_card" })).toBe("asaas");
  });
});
