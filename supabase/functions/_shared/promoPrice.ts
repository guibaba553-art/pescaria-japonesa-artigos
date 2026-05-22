// Server-side helpers para preço efetivo com promoções do SITE.
// Espelha src/utils/promoPrice.ts — mantenha as duas implementações em sincronia.

export interface PromoFields {
  on_sale?: boolean | null;
  sale_price?: number | null;
  sale_ends_at?: string | null;
  sale_limit_qty?: number | null;
  sale_sold_qty?: number | null;
  price?: number | null;
}

export function isPromoActive(item: PromoFields | null | undefined, now: Date = new Date()): boolean {
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

export function effectiveProductPrice(product: PromoFields): number {
  if (isPromoActive(product)) return Number(product.sale_price);
  return Number(product.price ?? 0);
}

export function effectiveVariationPrice(
  variation: PromoFields & { min_sale_price?: number | null },
  product?: (PromoFields & { min_sale_price?: number | null }) | null,
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

export const PROMO_PRODUCT_COLS =
  'price, sale_price, on_sale, sale_ends_at, sale_limit_qty, sale_sold_qty, min_sale_price';
export const PROMO_VARIATION_COLS =
  'price, sale_price, on_sale, sale_ends_at, sale_limit_qty, sale_sold_qty, min_sale_price, product_id';
