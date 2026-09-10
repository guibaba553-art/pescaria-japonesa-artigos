// Classificação das entradas de dinheiro por "conta" onde o valor cai:
// - stone: vendas do PDV (pix, crédito, débito) — maquininha/Stone
// - mercadopago / asaas: vendas do site, conforme o gateway do pagamento
// - cash: dinheiro em espécie (caixa separado)
import { normalizePaymentMethod } from "@/utils/pdvSettlement";

export type IncomeAccount = "stone" | "mercadopago" | "asaas" | "cash";

export const INCOME_ACCOUNT_LABEL: Record<IncomeAccount, string> = {
  stone: "Stone (PDV)",
  mercadopago: "Mercado Pago (Site)",
  asaas: "Asaas (Site)",
  cash: "Dinheiro (Caixa)",
};

export interface IncomeAccountInput {
  source?: string | null;
  payment_method?: string | null;
  payment_gateway?: string | null;
}

export function classifyIncomeAccount(input: IncomeAccountInput): IncomeAccount {
  const method = normalizePaymentMethod(input.payment_method);
  const gateway = String(input.payment_gateway || "").toLowerCase();

  if (method === "cash") return "cash";

  if (input.source === "pdv") return "stone";

  // Site: o gateway registrado no pagamento define a conta.
  if (gateway.includes("mercado")) return "mercadopago";
  if (gateway.includes("asaas")) return "asaas";

  // Sem gateway registrado: PIX do site é roteado ao Mercado Pago e cartão ao Asaas.
  return method === "pix" ? "mercadopago" : "asaas";
}

export type IncomeAccountTotals = Record<IncomeAccount, number>;

export const emptyIncomeAccountTotals = (): IncomeAccountTotals => ({
  stone: 0,
  mercadopago: 0,
  asaas: 0,
  cash: 0,
});
