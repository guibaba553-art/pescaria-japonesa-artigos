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
  // Overrides manuais por método. Quando definidos, têm prioridade sobre a fórmula.
  price_pdv_pix?: number | null;
  price_pdv_cash?: number | null;
  price_pdv_debit?: number | null;
  price_pdv_credit?: number | null;
  // Quando true, produto não recebe acréscimo de débito/crédito (usa sempre valor PIX).
  pdv_no_markup?: boolean | null;
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
  debit: 0.02,   // PIX + 2%
  credit: 0.03,  // PIX + 3%
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
  // Flag manual no produto tem prioridade
  if (p.pdv_no_markup === true) return true;
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

/** Retorna override manual do produto para o método, se existir e for válido. */
function getManualOverride(p: PdvPricingFields, method: PdvPaymentMethod): number | null {
  const map: Record<PdvPaymentMethod, number | null | undefined> = {
    pix: p.price_pdv_pix,
    cash: p.price_pdv_cash,
    debit: p.price_pdv_debit,
    credit: p.price_pdv_credit,
  };
  const v = map[method];
  if (v == null) return null;
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(2));
}

/** Calcula o preço final do produto para um método de pagamento. */
export function getPdvPrice(p: PdvPricingFields, method: PdvPaymentMethod): number {
  const manual = getManualOverride(p, method);
  if (manual != null) return manual;
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
