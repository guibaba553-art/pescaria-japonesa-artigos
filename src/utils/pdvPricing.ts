// Utilitários para calcular preços no PDV por método de pagamento
// O preço base é price_pdv (ou price do site, como fallback).
// Cada método aplica um percentual: positivo = acréscimo, negativo = desconto.

export type PdvPaymentMethod = 'cash' | 'debit' | 'credit' | 'pix';

export interface PdvPricingFields {
  price: number; // preço do site (fallback)
  price_pdv?: number | null;
  price_credit_percent?: number | null;
  price_debit_percent?: number | null;
  price_pix_percent?: number | null;
  price_cash_percent?: number | null;
}

/** Retorna o preço base do PDV (price_pdv ou, se ausente, o preço do site). */
export function getPdvBasePrice(p: PdvPricingFields): number {
  return p.price_pdv != null && !isNaN(Number(p.price_pdv))
    ? Number(p.price_pdv)
    : Number(p.price);
}

/** Retorna o percentual configurado para o método (0 se não definido). */
export function getMethodPercent(p: PdvPricingFields, method: PdvPaymentMethod): number {
  const map: Record<PdvPaymentMethod, number> = {
    cash: Number(p.price_cash_percent ?? 0),
    debit: Number(p.price_debit_percent ?? 0),
    credit: Number(p.price_credit_percent ?? 0),
    pix: Number(p.price_pix_percent ?? 0),
  };
  return map[method] || 0;
}

/** Calcula o preço final do produto para um método de pagamento. */
export function getPdvPrice(p: PdvPricingFields, method: PdvPaymentMethod): number {
  const base = getPdvBasePrice(p);
  const pct = getMethodPercent(p, method);
  const final = base * (1 + pct / 100);
  return Math.max(0, Number(final.toFixed(2)));
}

/** Aplica o mesmo percentual do produto pai a uma variação (a variação não tem campos próprios). */
export function getPdvPriceForVariation(
  parent: PdvPricingFields,
  variationPrice: number,
  method: PdvPaymentMethod,
): number {
  const pct = getMethodPercent(parent, method);
  const final = Number(variationPrice) * (1 + pct / 100);
  return Math.max(0, Number(final.toFixed(2)));
}
