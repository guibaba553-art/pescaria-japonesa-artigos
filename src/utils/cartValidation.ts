import type { SupabaseClient } from '@supabase/supabase-js';

export interface CartItemForValidation {
  product: { id: string };
  variation?: { id: string } | null;
  quantity: number;
}

export interface ValidationResult {
  validVariationIds: Set<string>;
  missing: string[];
}

/**
 * Verifica no banco se todos os variation_id presentes no carrinho ainda existem.
 * Usado para evitar violação de FK em order_items quando uma variação foi
 * removida/recriada entre o carregamento da tela e o fechamento da venda.
 */
export async function validateCartVariations(
  supabase: Pick<SupabaseClient, 'from'>,
  cart: CartItemForValidation[]
): Promise<ValidationResult> {
  const variationIds = Array.from(new Set(
    cart.map(i => i.variation?.id).filter((v): v is string => !!v)
  ));

  if (variationIds.length === 0) {
    return { validVariationIds: new Set(), missing: [] };
  }

  const { data, error } = await supabase
    .from('product_variations')
    .select('id')
    .in('id', variationIds);

  if (error) throw error;

  const validVariationIds = new Set((data || []).map((v: { id: string }) => v.id));
  const missing = variationIds.filter(id => !validVariationIds.has(id));
  return { validVariationIds, missing };
}

/**
 * Resolve o variation_id que será inserido em order_items: mantém o id original
 * apenas se ele consta no conjunto de variações válidas; caso contrário, null.
 */
export function resolveVariationIdForOrderItem(
  item: CartItemForValidation,
  validVariationIds: Set<string>
): string | null {
  if (item.variation && validVariationIds.has(item.variation.id)) {
    return item.variation.id;
  }
  return null;
}
