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
  // Promoções do catálogo — refletidas no PDV
  on_sale?: boolean | null;
  sale_price?: number | null;
  // Preço promocional exclusivo do PDV (usado quando a promo vale para os dois canais
  // mas com valores diferentes). Quando nulo, o PDV usa sale_price.
  sale_price_pdv?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  sale_limit_qty?: number | null;
  sale_sold_qty?: number | null;
  // 'site' | 'pdv' | 'both'. No PDV, ignora promo restrita a 'site'.
  sale_channel?: string | null;
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
  // Flag manual no produto tem prioridade
  if (p.pdv_no_markup === true) return true;
  const name = normalize(p.name || '');
  if (!name) return false;
  return EXEMPT_KEYWORDS.some((kw) => name.includes(normalize(kw)));
}

/** Preço "de" no PDV (price_pdv quando definido, senão price do site). */
function pdvBaseListPrice(p: PdvPricingFields): number {
  return p.price_pdv != null && !isNaN(Number(p.price_pdv))
    ? Number(p.price_pdv)
    : Number(p.price ?? 0);
}

/** Preço promocional aplicável no PDV (sale_price_pdv tem prioridade sobre sale_price). */
export function pdvPromoPrice(p: PdvPricingFields): number | null {
  const pdvSpecific = Number(p.sale_price_pdv ?? NaN);
  if (isFinite(pdvSpecific) && pdvSpecific > 0) return pdvSpecific;
  const generic = Number(p.sale_price ?? NaN);
  if (isFinite(generic) && generic > 0) return generic;
  return null;
}

/** Verifica se a promoção do catálogo está ativa para uso no PDV. */
export function isPdvPromoActive(p: PdvPricingFields, now: Date = new Date()): boolean {
  if (!p.on_sale) return false;
  if (p.sale_channel && p.sale_channel === 'site') return false;
  const promo = pdvPromoPrice(p);
  if (promo == null) return false;
  const base = pdvBaseListPrice(p);
  if (base <= 0) return false;
  if (promo >= base) return false;
  if (p.sale_starts_at) {
    const starts = new Date(p.sale_starts_at);
    if (!isNaN(starts.getTime()) && starts.getTime() > now.getTime()) return false;
  }
  // Toda promoção precisa de prazo final — sem prazo, não vale.
  if (!p.sale_ends_at) return false;
  {
    const ends = new Date(p.sale_ends_at);
    if (isNaN(ends.getTime())) return false;
    if (ends.getTime() <= now.getTime()) return false;
  }

  if (p.sale_limit_qty != null) {
    const sold = Number(p.sale_sold_qty ?? 0);
    if (sold >= Number(p.sale_limit_qty)) return false;
  }
  return true;
}


/** Retorna o preço base do PDV, considerando promoção ativa primeiro. */
export function getPdvBasePrice(p: PdvPricingFields): number {
  // Promoção ativa tem prioridade sobre price_pdv e price
  if (isPdvPromoActive(p)) {
    return Number(pdvPromoPrice(p));
  }
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

/** Retorna o preço original do PDV ignorando promoções (para exibir riscado). */
export function getPdvOriginalPrice(p: PdvPricingFields, method: PdvPaymentMethod): number {
  const manual = getManualOverride(p, method);
  if (manual != null) return manual;
  const base = p.price_pdv != null && !isNaN(Number(p.price_pdv))
    ? Number(p.price_pdv)
    : Number(p.price);
  return applyMethodMarkup(base, method, isExemptFromMarkup(p));
}

/** Calcula o preço final de uma variação aplicando a fórmula do método. */
export function getPdvPriceForVariation(
  parent: PdvPricingFields,
  variationPrice: number,
  method: PdvPaymentMethod,
  variation?: PdvPricingFields,
): number {
  // Promoção própria da variação tem prioridade
  if (variation && isPdvPromoActive(variation)) {
    return applyMethodMarkup(Number(pdvPromoPrice(variation)), method, isExemptFromMarkup(parent));
  }
  // Promoção do produto pai aplicada proporcionalmente
  if (isPdvPromoActive(parent)) {
    const baseP = pdvBaseListPrice(parent);
    if (baseP > 0) {
      const discount = 1 - Number(pdvPromoPrice(parent)) / baseP;
      const proportionalPrice = Number(variationPrice) * (1 - discount);
      return applyMethodMarkup(proportionalPrice, method, isExemptFromMarkup(parent));
    }
  }
  return applyMethodMarkup(Number(variationPrice), method, isExemptFromMarkup(parent));
}
