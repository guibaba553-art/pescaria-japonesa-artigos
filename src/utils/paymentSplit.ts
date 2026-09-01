// Pagamento dividido do PDV: uma venda pode ser paga com vários meios
// (ex.: R$ 76 no crédito + R$ 157 em dinheiro). Cada parte vira uma linha
// em `order_payments`, o que faz a previsão de recebíveis bater com a maquininha.

export interface PaymentPart {
  method: string;
  amount: number;
  installments?: number;
}

export interface SplitValidation {
  valid: boolean;
  paid: number;
  remaining: number;
  error?: string;
}

const cents = (v: number) => Math.round((Number(v) || 0) * 100);

/** Soma das partes (em reais, arredondada a centavos). */
export function sumParts(parts: PaymentPart[]): number {
  return parts.reduce((s, p) => s + cents(p.amount), 0) / 100;
}

/**
 * Valida o rateio: toda parte precisa de valor > 0, crédito precisa de
 * parcelas entre 1 e 12, e a soma tem que fechar exatamente com o total.
 * Dinheiro pode exceder o total (troco) — nesse caso o excedente é o troco.
 */
export function validateSplit(total: number, parts: PaymentPart[]): SplitValidation {
  const paidCents = parts.reduce((s, p) => s + cents(p.amount), 0);
  const totalCents = cents(total);
  const base = { paid: paidCents / 100, remaining: (totalCents - paidCents) / 100 };

  if (parts.length === 0) {
    return { ...base, valid: false, error: "Adicione pelo menos uma forma de pagamento." };
  }
  if (parts.some((p) => cents(p.amount) <= 0)) {
    return { ...base, valid: false, error: "Todas as formas de pagamento precisam de um valor." };
  }
  const badCredit = parts.some(
    (p) => p.method === "credit" && (!p.installments || p.installments < 1 || p.installments > 12),
  );
  if (badCredit) {
    return { ...base, valid: false, error: "Informe o número de parcelas do crédito (1 a 12)." };
  }

  const cashCents = parts
    .filter((p) => p.method === "cash")
    .reduce((s, p) => s + cents(p.amount), 0);
  const nonCashCents = paidCents - cashCents;

  if (nonCashCents > totalCents) {
    return { ...base, valid: false, error: "O valor em cartão/PIX excede o total da venda." };
  }
  if (paidCents < totalCents) {
    return { ...base, valid: false, error: "Falta cobrir o valor total da venda." };
  }
  return { ...base, valid: true, remaining: 0 };
}

/** Troco: só o que sobra em dinheiro depois de cobrir o total. */
export function splitChange(total: number, parts: PaymentPart[]): number {
  const diff = cents(sumParts(parts)) - cents(total);
  return diff > 0 ? diff / 100 : 0;
}

/** Parte de maior valor — usada como método "principal" do pedido. */
export function primaryPart(parts: PaymentPart[]): PaymentPart | null {
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => (cents(b.amount) > cents(a.amount) ? b : a));
}
