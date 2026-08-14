import { fuzzySearch, tokenize } from '@/lib/fuzzySearch';

const SELECT_FIELDS = `id, name, price, image_url, category, subcategory, sku, brand_id, brands(name), min_sale_price, on_sale, sale_price, sale_ends_at, sale_limit_qty, sale_sold_qty, variations:product_variations(id, name, price, stock, image_url, on_sale, sale_price, sale_ends_at, sale_limit_qty, sale_sold_qty, min_sale_price)`;

export const productSearchFields = (p: any): (string | null | undefined)[] => [
  p?.name,
  p?.brands?.name ?? p?.brand,
  p?.sku,
  p?.subcategory,
  p?.category,
  Array.isArray(p?.variations) ? p.variations.map((v: any) => `${v?.name ?? ''} ${v?.sku ?? ''}`).join(' ') : '',
];

function escapeOr(value: string): string {
  return value.replace(/[,()]/g, ' ');
}

/**
 * Busca tolerante a erros de digitação/acentos.
 * 1) tenta filtrar no banco por qualquer termo (nome, sku, subcategoria, categoria)
 * 2) se não achar nada, carrega um lote de produtos e faz a busca aproximada no cliente
 */
export async function searchProductsSmart(
  client: any,
  rawQuery: string,
  limit = 8
): Promise<any[]> {
  const tokens = tokenize(rawQuery);
  if (tokens.length === 0) return [];

  const base = () =>
    client.from('products').select(SELECT_FIELDS).eq('pdv_only', false).gt('stock', 0);

  const orFilter = tokens
    .flatMap((t) => {
      const s = escapeOr(t);
      return [`name.ilike.%${s}%`, `sku.ilike.%${s}%`, `subcategory.ilike.%${s}%`, `category.ilike.%${s}%`];
    })
    .join(',');

  let candidates: any[] = [];
  const { data, error } = await base().or(orFilter).limit(60);
  if (!error && data) candidates = data;

  const ranked = fuzzySearch(candidates, rawQuery, productSearchFields, limit);
  if (ranked.length > 0) return ranked;

  // Fallback aproximado: erros de digitação que o ilike não pega
  const { data: pool, error: poolError } = await base().order('name', { ascending: true }).limit(400);
  if (poolError || !pool) return [];
  return fuzzySearch(pool, rawQuery, productSearchFields, limit);
}
