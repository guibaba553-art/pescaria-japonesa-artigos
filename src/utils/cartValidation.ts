import { supabase } from '@/integrations/supabase/client';

export interface CartItemLike {
  id: string;
  name: string;
  price: number;
  quantity: number;
  variationId?: string;
  cartItemKey: string;
}

export interface CartValidationIssue {
  cartItemKey: string;
  name: string;
  reason: 'product_not_found' | 'variation_not_found' | 'out_of_stock' | 'price_changed';
  details?: string;
  newPrice?: number;
  availableStock?: number;
}

export interface CartValidationResult {
  valid: boolean;
  issues: CartValidationIssue[];
  /** Itens que devem ser removidos imediatamente do carrinho (não existem mais). */
  removeKeys: string[];
}

/**
 * Valida cada item do carrinho contra o banco. Detecta produtos/variações
 * apagados, sem estoque ou com preço alterado.
 */
export async function validateCart(items: CartItemLike[]): Promise<CartValidationResult> {
  const issues: CartValidationIssue[] = [];
  const removeKeys: string[] = [];

  for (const item of items) {
    if (item.variationId) {
      const { data: variation } = await supabase
        .from('product_variations')
        .select('id, price, stock, name, product_id')
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

      // Verificar produto pai existe
      const { data: product } = await supabase
        .from('products')
        .select('id, on_sale, sale_price, price')
        .eq('id', variation.product_id)
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

      if (variation.stock < item.quantity) {
        issues.push({
          cartItemKey: item.cartItemKey,
          name: item.name,
          reason: 'out_of_stock',
          details: `Apenas ${variation.stock} em estoque.`,
          availableStock: variation.stock,
        });
      }

      // Preço calculado igual ao backend
      let expectedPrice = Number(variation.price);
      if (product.on_sale && product.sale_price !== null && Number(product.price) > 0) {
        const discount = 1 - (Number(product.sale_price) / Number(product.price));
        expectedPrice = expectedPrice * (1 - discount);
      }
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
        .select('id, price, sale_price, on_sale, stock')
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

      if (product.stock < item.quantity) {
        issues.push({
          cartItemKey: item.cartItemKey,
          name: item.name,
          reason: 'out_of_stock',
          details: `Apenas ${product.stock} em estoque.`,
          availableStock: product.stock,
        });
      }

      const expectedPrice = product.on_sale && product.sale_price
        ? Number(product.sale_price)
        : Number(product.price);
      if (Math.abs(expectedPrice - item.price) > 0.01) {
        issues.push({
          cartItemKey: item.cartItemKey,
          name: item.name,
          reason: 'price_changed',
          details: 'O preço foi atualizado.',
          newPrice: expectedPrice,
        });
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    removeKeys,
  };
}

/**
 * Tenta extrair a mensagem de erro vinda do body de uma resposta de edge
 * function que retornou status não-2xx (supabase.functions.invoke devolve apenas
 * "Edge Function returned a non-2xx status code").
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
