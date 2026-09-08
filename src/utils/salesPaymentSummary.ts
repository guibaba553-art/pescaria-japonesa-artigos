// Resumo de vendas do PDV por meio de pagamento.
// Quando a venda foi paga de forma dividida (várias linhas em `order_payments`),
// cada parte entra no seu próprio meio — assim o caixa (dinheiro) não recebe
// o valor inteiro de uma venda que foi parte cartão, parte dinheiro.
import { normalizePaymentMethod } from "@/utils/pdvSettlement";

export interface SummaryOrderLike {
  id: string;
  total_amount: number;
  payment_method?: string | null;
}

export interface SummaryPaymentLike {
  order_id: string;
  payment_method?: string | null;
  amount: number;
}

export interface PaymentSummary {
  cash: number;
  card: number;
  pix: number;
  other: number;
}

const round2 = (v: number) => Number(v.toFixed(2));

function addTo(summary: PaymentSummary, method: string | null | undefined, amount: number) {
  const value = Number(amount) || 0;
  switch (normalizePaymentMethod(method)) {
    case "pix":
      summary.pix += value;
      break;
    case "cash":
      summary.cash += value;
      break;
    case "credit":
    case "debit":
      summary.card += value;
      break;
    default: {
      const raw = String(method || "").toLowerCase();
      if (raw.includes("card") || raw.includes("cart")) summary.card += value;
      else summary.other += value;
    }
  }
}

/**
 * Soma as vendas por meio de pagamento, usando o rateio de `order_payments`
 * quando existir e caindo para `orders.payment_method` quando não existir.
 */
export function summarizeSalesByMethod(
  orders: SummaryOrderLike[],
  payments: SummaryPaymentLike[] = [],
): PaymentSummary {
  const summary: PaymentSummary = { cash: 0, card: 0, pix: 0, other: 0 };

  const byOrder = new Map<string, SummaryPaymentLike[]>();
  for (const p of payments) {
    const arr = byOrder.get(p.order_id) ?? [];
    arr.push(p);
    byOrder.set(p.order_id, arr);
  }

  for (const order of orders) {
    const parts = byOrder.get(order.id);
    if (parts && parts.length > 0) {
      for (const part of parts) addTo(summary, part.payment_method, part.amount);
    } else {
      addTo(summary, order.payment_method, order.total_amount);
    }
  }

  return {
    cash: round2(summary.cash),
    card: round2(summary.card),
    pix: round2(summary.pix),
    other: round2(summary.other),
  };
}
