/**
 * Busca os preços (no crédito, mesma regra do PDV) dos itens que vão para as
 * etiquetas. Retorna um mapa `${product_id}:${variation_id ?? ''}` -> preço.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { getPdvPrice, getPdvPriceForVariation } from '@/utils/pdvPricing';

export interface LabelPriceTarget {
  product_id: string;
  variation_id: string | null;
}

type ProductAdmin = Database['public']['Functions']['get_products_admin']['Returns'][number];
type VariationAdmin = Database['public']['Functions']['get_product_variations_admin']['Returns'][number];

export const labelPriceKey = (productId: string, variationId: string | null) =>
  `${productId}:${variationId || ''}`;

export async function fetchLabelPrices(
  targets: LabelPriceTarget[]
): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  if (targets.length === 0) return map;

  const productIds = Array.from(new Set(targets.map((t) => t.product_id)));
  const variationIds = Array.from(
    new Set(targets.map((t) => t.variation_id).filter(Boolean) as string[])
  );

  const [prodRes, varRes] = await Promise.all([
    supabase.rpc('get_products_admin'),
    variationIds.length
      ? supabase.rpc('get_product_variations_admin')
      : Promise.resolve<{ data: VariationAdmin[] | null; error: null }>({ data: [], error: null }),
  ]);

  const products = new Map<string, ProductAdmin>(
    ((prodRes.data || []) as ProductAdmin[]).filter((p) => productIds.includes(p.id)).map((p) => [p.id, p])
  );
  const variations = new Map<string, VariationAdmin>(
    ((varRes.data || []) as VariationAdmin[]).filter((v) => variationIds.includes(v.id)).map((v) => [v.id, v])
  );

  for (const t of targets) {
    const parent = products.get(t.product_id);
    if (!parent) continue;
    let price: number;
    if (t.variation_id) {
      const v = variations.get(t.variation_id);
      if (!v) continue;
      price = getPdvPriceForVariation(parent, Number(v.price_pdv ?? v.price ?? 0), 'credit', v);
    } else {
      price = getPdvPrice(parent, 'credit');
    }
    if (!isNaN(price) && price > 0) {
      map[labelPriceKey(t.product_id, t.variation_id)] = price;
    }
  }

  return map;
}
