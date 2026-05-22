/**
 * Helpers de promoção do SITE (não usar no PDV).
 *
 * Considera:
 * - on_sale = true
 * - sale_price preenchido e menor que o preço base
 * - sale_ends_at no futuro (ou nulo)
 * - sale_limit_qty não atingido (ou nulo)
 *
 * Variação com promo própria tem prioridade sobre a promo do produto pai.
 */

export interface PromoFields {
  on_sale?: boolean | null;
  sale_price?: number | null;
  sale_ends_at?: string | null;
  sale_limit_qty?: number | null;
  sale_sold_qty?: number | null;
  price?: number | null;
}

/** Retorna true se a promo está válida (ativa, no prazo e com estoque promocional). */
export function isPromoActive(item: PromoFields, now: Date = new Date()): boolean {
  if (!item) return false;
  if (!item.on_sale) return false;
  if (item.sale_price == null) return false;
  const base = Number(item.price ?? 0);
  if (base <= 0) return false;
  if (Number(item.sale_price) >= base) return false;
  if (item.sale_ends_at) {
    const ends = new Date(item.sale_ends_at);
    if (!isNaN(ends.getTime()) && ends.getTime() <= now.getTime()) return false;
  }
  if (item.sale_limit_qty != null) {
    const sold = Number(item.sale_sold_qty ?? 0);
    if (sold >= Number(item.sale_limit_qty)) return false;
  }
  return true;
}

/** Preço efetivo de um produto SEM variação (ou do produto pai). */
export function effectiveProductPrice(product: PromoFields): number {
  if (isPromoActive(product)) return Number(product.sale_price);
  return Number(product.price ?? 0);
}

/**
 * Preço efetivo de uma variação considerando:
 * 1. Promo própria da variação
 * 2. min_sale_price da variação
 * 3. min_sale_price do produto pai
 * 4. Promo do produto pai aplicada proporcionalmente sobre o preço base da variação
 * 5. price padrão da variação
 */
export function effectiveVariationPrice(
  variation: PromoFields & { min_sale_price?: number | null },
  product?: PromoFields & { min_sale_price?: number | null },
): number {
  if (isPromoActive(variation)) return Number(variation.sale_price);

  const vMin = Number(variation.min_sale_price) || 0;
  if (vMin > 0) return vMin;

  const pMin = Number(product?.min_sale_price) || 0;
  if (pMin > 0) return pMin;

  const vBase = Number(variation.price ?? 0);
  if (product && isPromoActive(product)) {
    const baseP = Number(product.price ?? 0);
    if (baseP > 0) {
      const discount = 1 - Number(product.sale_price) / baseP;
      return vBase * (1 - discount);
    }
  }
  return vBase;
}
