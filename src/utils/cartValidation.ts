import type { SupabaseClient } from '@supabase/supabase-js';

export interface CartItemForValidation {
  product: { id: string; stock?: number | null; name?: string };
  variation?: {
    id: string;
    sku?: string | null;
    name?: string | null;
    price?: number | null;
    stock?: number | null;
  } | null;
  quantity: number;
}

export interface ValidationResult {
  validVariationIds: Set<string>;
  missing: string[];
}

export interface ResolvedCartInventoryItem {
  resolvedVariationId: string | null;
  availableStock: number;
  wasReconciled: boolean;
  usedProductFallback: boolean;
}

export interface ResolvedCartInventory {
  validVariationIds: Set<string>;
  missing: string[];
  reconciledVariationIds: Map<string, string>;
  resolvedItems: ResolvedCartInventoryItem[];
}

interface LiveVariationRow {
  id: string;
  product_id: string;
  stock: number | string | null;
  sku?: string | null;
  name?: string | null;
  price?: number | string | null;
}

function normalizeText(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function matchReplacementVariation(
  originalVariation: NonNullable<CartItemForValidation['variation']>,
  candidates: LiveVariationRow[]
) {
  if (candidates.length === 0) return null;

  const originalSku = normalizeText(originalVariation.sku);
  if (originalSku) {
    const skuMatch = candidates.find(v => normalizeText(v.sku) === originalSku);
    if (skuMatch) return skuMatch;
  }

  const originalName = normalizeText(originalVariation.name);
  if (originalName) {
    const nameMatches = candidates.filter(v => normalizeText(v.name) === originalName);
    if (nameMatches.length === 1) return nameMatches[0];

    if (nameMatches.length > 1 && originalVariation.price != null) {
      const originalPrice = toNumber(originalVariation.price);
      const priceMatch = nameMatches.find(v => toNumber(v.price) === originalPrice);
      if (priceMatch) return priceMatch;
    }
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  return null;
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
 * Recarrega o estoque real dos produtos/variações do carrinho e tenta reconciliar
 * variações recriadas (mesmo SKU/nome) antes de registrar a venda.
 */
export async function resolveCartInventory(
  supabase: Pick<SupabaseClient, 'from'>,
  cart: CartItemForValidation[]
): Promise<ResolvedCartInventory> {
  const productIds = Array.from(new Set(cart.map(item => item.product.id).filter(Boolean)));
  const variationProductIds = Array.from(new Set(
    cart.filter(item => !!item.variation).map(item => item.product.id)
  ));

  const [productsResult, variationsResult] = await Promise.all([
    productIds.length > 0
      ? supabase.from('products').select('id, stock').in('id', productIds)
      : Promise.resolve({ data: [], error: null }),
    variationProductIds.length > 0
      ? supabase
          .from('product_variations')
          .select('id, product_id, stock, sku, name, price')
          .in('product_id', variationProductIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (productsResult.error) throw productsResult.error;
  if (variationsResult.error) throw variationsResult.error;

  const productsById = new Map(
    ((productsResult.data || []) as Array<{ id: string; stock: number | string | null }>).map(product => [
      product.id,
      toNumber(product.stock),
    ])
  );

  const liveVariations = (variationsResult.data || []) as LiveVariationRow[];
  const validVariationIds = new Set(liveVariations.map(variation => variation.id));
  const variationsById = new Map(liveVariations.map(variation => [variation.id, variation]));
  const variationsByProduct = new Map<string, LiveVariationRow[]>();

  liveVariations.forEach(variation => {
    const existing = variationsByProduct.get(variation.product_id) || [];
    existing.push(variation);
    variationsByProduct.set(variation.product_id, existing);
  });

  const missing = Array.from(new Set(
    cart.map(item => item.variation?.id)
      .filter((id): id is string => !!id && !validVariationIds.has(id))
  ));

  const reconciledVariationIds = new Map<string, string>();
  const resolvedItems = cart.map(item => {
    const productStock = productsById.get(item.product.id) ?? toNumber(item.product.stock);

    if (!item.variation) {
      return {
        resolvedVariationId: null,
        availableStock: productStock,
        wasReconciled: false,
        usedProductFallback: false,
      };
    }

    const liveVariation = variationsById.get(item.variation.id);
    if (liveVariation) {
      return {
        resolvedVariationId: liveVariation.id,
        availableStock: toNumber(liveVariation.stock),
        wasReconciled: false,
        usedProductFallback: false,
      };
    }

    const replacement = matchReplacementVariation(
      item.variation,
      variationsByProduct.get(item.product.id) || []
    );

    if (replacement) {
      reconciledVariationIds.set(item.variation.id, replacement.id);
      return {
        resolvedVariationId: replacement.id,
        availableStock: toNumber(replacement.stock),
        wasReconciled: true,
        usedProductFallback: false,
      };
    }

    return {
      resolvedVariationId: null,
      availableStock: productStock,
      wasReconciled: false,
      usedProductFallback: true,
    };
  });

  return {
    validVariationIds,
    missing,
    reconciledVariationIds,
    resolvedItems,
  };
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
