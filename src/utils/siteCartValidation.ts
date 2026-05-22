import { supabase } from '@/integrations/supabase/client';
import { effectiveProductPrice, effectiveVariationPrice } from './promoPrice';

export interface SiteCartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  variationId?: string;
  cartItemKey: string;
}

export interface SiteCartIssue {
  cartItemKey: string;
  name: string;
  reason: 'product_not_found' | 'variation_not_found' | 'out_of_stock' | 'price_changed';
  details?: string;
  newPrice?: number;
  availableStock?: number;
}

export interface SiteCartValidationResult {
  valid: boolean;
  issues: SiteCartIssue[];
  /** Itens órfãos que devem ser removidos do carrinho. */
  removeKeys: string[];
}

/**
 * Valida cada item do carrinho do SITE (lojinha pública) contra o banco.
 * Detecta produtos/variações apagados, sem estoque ou com preço alterado.
 * Não confundir com cartValidation.ts (usado pelo PDV).
 */
export async function validateSiteCart(
  items: SiteCartItem[],
): Promise<SiteCartValidationResult> {
  const issues: SiteCartIssue[] = [];
  const removeKeys: string[] = [];

  for (const item of items) {
    if (item.variationId) {
      const { data: variation } = await supabase
        .from('product_variations')
        .select('id, price, stock, name, product_id, on_sale, sale_price, sale_ends_at, sale_limit_qty, sale_sold_qty, min_sale_price')
        .eq('id', item.variationId)
        .maybeSingle();

      if (!variation) {
        issues.push({
          cartItemKey: item.cartItemKey,
          name: item.name,
          reason: 'variation_not_found',
          details: 'Esta variação não está mais disponível.',
        });
        removeKeys.push(item.cartItemKey);
        continue;
      }

      const { data: product } = await supabase
        .from('products')
        .select('id, on_sale, sale_price, sale_ends_at, sale_limit_qty, sale_sold_qty, price, min_sale_price')
        .eq('id', (variation as any).product_id)
        .maybeSingle();

      if (!product) {
        issues.push({
          cartItemKey: item.cartItemKey,
          name: item.name,
          reason: 'product_not_found',
          details: 'Produto não está mais disponível.',
        });
        removeKeys.push(item.cartItemKey);
        continue;
      }

      if (((variation as any).stock ?? 0) < item.quantity) {
        issues.push({
          cartItemKey: item.cartItemKey,
          name: item.name,
          reason: 'out_of_stock',
          details: `Apenas ${(variation as any).stock ?? 0} em estoque.`,
          availableStock: (variation as any).stock ?? 0,
        });
      }

      const expectedPrice = effectiveVariationPrice(variation as any, product as any);
      if (Math.abs(expectedPrice - item.price) > 0.01) {
        issues.push({
          cartItemKey: item.cartItemKey,
          name: item.name,
          reason: 'price_changed',
          details: 'O preço foi atualizado.',
          newPrice: Number(expectedPrice.toFixed(2)),
        });
      }
    } else {
      const { data: product } = await supabase
        .from('products')
        .select('id, price, sale_price, on_sale, sale_ends_at, sale_limit_qty, sale_sold_qty, stock')
        .eq('id', item.id)
        .maybeSingle();

      if (!product) {
        issues.push({
          cartItemKey: item.cartItemKey,
          name: item.name,
          reason: 'product_not_found',
          details: 'Produto não está mais disponível.',
        });
        removeKeys.push(item.cartItemKey);
        continue;
      }

      if (((product as any).stock ?? 0) < item.quantity) {
        issues.push({
          cartItemKey: item.cartItemKey,
          name: item.name,
          reason: 'out_of_stock',
          details: `Apenas ${(product as any).stock ?? 0} em estoque.`,
          availableStock: (product as any).stock ?? 0,
        });
      }

      const expectedPrice = effectiveProductPrice(product as any);
      if (Math.abs(expectedPrice - item.price) > 0.01) {
        issues.push({
          cartItemKey: item.cartItemKey,
          name: item.name,
          reason: 'price_changed',
          details: 'O preço foi atualizado.',
          newPrice: Number(expectedPrice.toFixed(2)),
        });
      }
    }
  }

  return { valid: issues.length === 0, issues, removeKeys };
}

/**
 * Extrai a mensagem real do body de uma resposta non-2xx de edge function.
 * `supabase.functions.invoke` infelizmente devolve apenas
 * "Edge Function returned a non-2xx status code" como `error.message`.
 */
export async function extractEdgeError(error: unknown): Promise<string | null> {
  try {
    const ctx = (error as any)?.context;
    if (!ctx) return null;
    if (typeof ctx.json === 'function') {
      const body = await ctx.json();
      return body?.error || body?.message || null;
    }
    if (typeof ctx.text === 'function') {
      const text = await ctx.text();
      try {
        const body = JSON.parse(text);
        return body?.error || body?.message || text;
      } catch {
        return text;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}
