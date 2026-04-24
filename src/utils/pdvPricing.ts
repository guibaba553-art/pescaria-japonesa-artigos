// Utilitários para calcular preços no PDV por método de pagamento
// Regra fixa de negócio:
//   - PIX e Dinheiro = preço base cadastrado (price_pdv ou price do site)
//   - Débito         = PIX + 5%
//   - Crédito        = Débito + 5%  (= PIX * 1,1025)

export type PdvPaymentMethod = 'cash' | 'debit' | 'credit' | 'pix';

export interface PdvPricingFields {
  price: number; // preço do site (fallback quando price_pdv não está definido)
  price_pdv?: number | null;
  // Os campos abaixo permanecem no tipo apenas por compatibilidade,
  // mas NÃO são mais usados no cálculo (a fórmula é fixa).
  price_credit_percent?: number | null;
  price_debit_percent?: number | null;
  price_pix_percent?: number | null;
  price_cash_percent?: number | null;
}

// Acréscimos fixos por método (sobre o preço base = PIX)
export const PDV_METHOD_MARKUP: Record<PdvPaymentMethod, number> = {
  pix: 0,        // base
  cash: 0,       // mesmo do PIX
  debit: 0.05,   // PIX + 5%
  credit: 0.1025 // Débito + 5% = PIX * 1,05 * 1,05
};

/** Retorna o preço base do PDV (price_pdv ou, se ausente, o preço do site). */
export function getPdvBasePrice(p: PdvPricingFields): number {
  return p.price_pdv != null && !isNaN(Number(p.price_pdv))
    ? Number(p.price_pdv)
    : Number(p.price);
}

/** Aplica a fórmula fixa do método ao preço base informado. */
function applyMethodMarkup(basePrice: number, method: PdvPaymentMethod): number {
  const markup = PDV_METHOD_MARKUP[method] ?? 0;
  const final = Number(basePrice) * (1 + markup);
  return Math.max(0, Number(final.toFixed(2)));
}

/** Calcula o preço final do produto para um método de pagamento. */
export function getPdvPrice(p: PdvPricingFields, method: PdvPaymentMethod): number {
  return applyMethodMarkup(getPdvBasePrice(p), method);
}

/** Calcula o preço final de uma variação aplicando a fórmula do método. */
export function getPdvPriceForVariation(
  _parent: PdvPricingFields,
  variationPrice: number,
  method: PdvPaymentMethod,
): number {
  return applyMethodMarkup(Number(variationPrice), method);
}
