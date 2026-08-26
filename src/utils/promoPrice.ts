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
import { useEffect, useState } from 'react';

export interface PromoFields {
  on_sale?: boolean | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  sale_limit_qty?: number | null;
  sale_sold_qty?: number | null;
  sale_channel?: string | null;
  price?: number | null;
  min_sale_price?: number | null;
}

/** Valida o prazo antes de gravar uma promoção. Promoções sempre devem expirar. */
export function validatePromotionPeriod(
  startsAt: string,
  endsAt: string,
  now: Date = new Date(),
): string | null {
  if (!endsAt) return 'Informe a data final da promoção.';

  const end = new Date(endsAt);
  if (isNaN(end.getTime())) return 'A data final da promoção é inválida.';

  const start = startsAt ? new Date(startsAt) : now;
  if (isNaN(start.getTime())) return 'A data inicial da promoção é inválida.';
  if (end.getTime() <= start.getTime()) return 'A data final deve ser posterior à data inicial.';

  return null;
}

/**
 * Preço base "de" exibido no site: min_sale_price quando definido,
 * senão o price cadastrado. A promoção é comparada contra esse valor
 * porque é o preço que o cliente vê riscado.
 */
export function promoBasePrice(item: PromoFields): number {
  const min = Number(item?.min_sale_price ?? 0);
  if (min > 0) return min;
  return Number(item?.price ?? 0);
}

/** Retorna true se a promo está válida (ativa, no prazo e com estoque promocional). */
export function isPromoActive(item: PromoFields, now: Date = new Date()): boolean {
  if (!item) return false;
  if (!item.on_sale) return false;
  if (item.sale_price == null) return false;
  // Canal da promoção: 'site' | 'pdv' | 'both'. No site, ignora 'pdv'.
  if (item.sale_channel && item.sale_channel === 'pdv') return false;
  const base = promoBasePrice(item);
  if (base <= 0) return false;
  if (Number(item.sale_price) >= base) return false;
  if (item.sale_starts_at) {
    const starts = new Date(item.sale_starts_at);
    if (!isNaN(starts.getTime()) && starts.getTime() > now.getTime()) return false;
  }
  // Toda promoção precisa de prazo final definido — sem prazo, não é considerada ativa.
  if (!item.sale_ends_at) return false;
  {
    const ends = new Date(item.sale_ends_at);
    if (isNaN(ends.getTime())) return false;
    if (ends.getTime() <= now.getTime()) return false;
  }

  if (item.sale_limit_qty != null) {
    const sold = Number(item.sale_sold_qty ?? 0);
    if (sold >= Number(item.sale_limit_qty)) return false;
  }
  return true;
}


/** Retorna true se a promo está agendada para o futuro (ainda não começou). */
export function isPromoScheduled(item: PromoFields, now: Date = new Date()): boolean {
  if (!item?.on_sale || !item.sale_starts_at) return false;
  const starts = new Date(item.sale_starts_at);
  if (isNaN(starts.getTime())) return false;
  return starts.getTime() > now.getTime();
}


/** Preço efetivo de um produto SEM variação (ou do produto pai). */
export function effectiveProductPrice(
  product: PromoFields & { min_sale_price?: number | null },
): number {
  // Promo ativa tem prioridade
  if (isPromoActive(product)) return Number(product.sale_price);
  // min_sale_price é o "preço exibido no site" quando definido (não é apenas piso)
  const pMin = Number(product?.min_sale_price) || 0;
  if (pMin > 0) return pMin;
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
    const baseP = promoBasePrice(product);
    if (baseP > 0) {
      const discount = 1 - Number(product.sale_price) / baseP;
      return vBase * (1 - discount);
    }
  }
  return vBase;
}

/**
 * Preço efetivo considerando variações.
 * Se o produto tem variações com preço > 0, retorna o menor preço efetivo
 * entre elas (usando effectiveVariationPrice). Caso contrário, cai para
 * effectiveProductPrice (preço do produto base).
 */
export function effectiveProductOrVariationPrice(
  product: PromoFields & {
    min_sale_price?: number | null;
    variations?: (PromoFields & { min_sale_price?: number | null })[];
  },
): number {
  const vars = product.variations;
  if (vars && vars.length > 0) {
    const prices = vars
      .map((v) => effectiveVariationPrice(v, product))
      .filter((p) => p > 0 && isFinite(p));
    if (prices.length > 0) {
      return Math.min(...prices);
    }
  }
  return effectiveProductPrice(product);
}

/**
 * Retorna a imagem correta para exibição/carrinho.
 * Se há uma variação selecionada com imagem própria, usa a imagem da variação.
 * Caso contrário, usa a imagem do produto base.
 */
export function getProductDisplayImage(
  baseImageUrl: string | null,
  selectedVariation?: { image_url?: string | null } | null,
): string | null {
  if (selectedVariation?.image_url) return selectedVariation.image_url;
  return baseImageUrl;
}

/**
 * Hook que força re-render no instante em que a promoção mais próxima expira.
 * Coleta sale_ends_at do produto e de suas variações, agenda um timeout para o
 * mais próximo no futuro e atualiza um state quando dispara. Evita que o preço
 * promocional continue aparecendo após o término do prazo.
 */
export function usePromoExpiryTick(
  product?: (PromoFields & { variations?: PromoFields[] | null }) | null,
): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!product) return;
    const now = Date.now();
    const candidates: number[] = [];
    const collect = (p?: PromoFields | null) => {
      if (!p?.on_sale) return;
      if (p.sale_starts_at) {
        const t = new Date(p.sale_starts_at).getTime();
        if (!isNaN(t) && t > now) candidates.push(t);
      }
      if (p.sale_ends_at) {
        const t = new Date(p.sale_ends_at).getTime();
        if (!isNaN(t) && t > now) candidates.push(t);
      }
    };
    collect(product);
    product.variations?.forEach(collect);
    if (candidates.length === 0) return;
    const next = Math.min(...candidates);
    const delay = Math.min(next - now + 500, 2_147_000_000);
    const id = window.setTimeout(() => setTick((n) => n + 1), Math.max(delay, 100));
    return () => window.clearTimeout(id);
  }, [product]);
}

