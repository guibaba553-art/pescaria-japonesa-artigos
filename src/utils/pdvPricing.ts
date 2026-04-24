// Utilitários para calcular preços no PDV por método de pagamento
// Regra fixa de negócio:
//   - PIX e Dinheiro = preço base cadastrado (price_pdv ou price do site)
//   - Débito         = PIX + 3%
//   - Crédito        = PIX + 4%
//
// EXCEÇÕES (não recebem acréscimo, sempre cobram o valor do PIX):
//   - Óleo 2 tempos Yamalube
//   - Refil de gás

export type PdvPaymentMethod = 'cash' | 'debit' | 'credit' | 'pix';

export interface PdvPricingFields {
  name?: string;
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
  debit: 0.03,   // PIX + 3%
  credit: 0.04,  // PIX + 4%
};

/**
 * Produtos isentos de acréscimo: pagam sempre o valor do PIX,
 * mesmo no débito ou crédito.
 * A checagem é case-insensitive e por substring no nome.
 */
const EXEMPT_KEYWORDS: string[] = [
  'yamalube',     // Óleo 2 tempos Yamalube
  'refil de gas', // Refil de gás (com/sem acento)
  'refil de gás',
];

function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Indica se o produto é isento de acréscimo por método de pagamento. */
export function isExemptFromMarkup(p: PdvPricingFields): boolean {
  const name = normalize(p.name || '');
  if (!name) return false;
  return EXEMPT_KEYWORDS.some((kw) => name.includes(normalize(kw)));
}

/** Retorna o preço base do PDV (price_pdv ou, se ausente, o preço do site). */
export function getPdvBasePrice(p: PdvPricingFields): number {
  return p.price_pdv != null && !isNaN(Number(p.price_pdv))
    ? Number(p.price_pdv)
    : Number(p.price);
}

/** Aplica a fórmula fixa do método ao preço base informado. */
function applyMethodMarkup(basePrice: number, method: PdvPaymentMethod, exempt = false): number {
  const markup = exempt ? 0 : (PDV_METHOD_MARKUP[method] ?? 0);
  const final = Number(basePrice) * (1 + markup);
  return Math.max(0, Number(final.toFixed(2)));
}

/** Calcula o preço final do produto para um método de pagamento. */
export function getPdvPrice(p: PdvPricingFields, method: PdvPaymentMethod): number {
  return applyMethodMarkup(getPdvBasePrice(p), method, isExemptFromMarkup(p));
}

/** Calcula o preço final de uma variação aplicando a fórmula do método. */
export function getPdvPriceForVariation(
  parent: PdvPricingFields,
  variationPrice: number,
  method: PdvPaymentMethod,
): number {
  return applyMethodMarkup(Number(variationPrice), method, isExemptFromMarkup(parent));
}
