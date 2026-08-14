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
 * Expande produtos em uma entrada por variação (quando houver),
 * priorizando as variações que combinam com a busca.
 */
export function expandVariationSuggestions(products: any[], query: string, limit?: number): any[] {
  const out: any[] = [];
  for (const p of products) {
    const vars = (Array.isArray(p?.variations) ? p.variations : []).filter(
      (v: any) => (v?.stock ?? 0) > 0
    );
    if (vars.length === 0) {
      out.push({ ...p, variations: [] });
      continue;
    }
    const matched = fuzzySearch(vars, query, (v: any) => [
      `${p?.name ?? ''} ${v?.name ?? ''}`,
      v?.name,
      v?.sku,
      p?.name,
    ]);
    const list = matched.length > 0 ? matched : vars;
    for (const v of list) {
      out.push({
        ...p,
        variations: [],
        variation_id: v.id,
        name: `${p.name} - ${v.name}`,
        image_url: v.image_url ?? p.image_url,
        price: v.price,
        on_sale: v.on_sale,
        sale_price: v.sale_price,
        sale_ends_at: v.sale_ends_at,
        sale_limit_qty: v.sale_limit_qty,
        sale_sold_qty: v.sale_sold_qty,
        min_sale_price: v.min_sale_price ?? p.min_sale_price,
      });
    }
  }
  return limit ? out.slice(0, limit) : out;
}

/**
 * Busca tolerante a erros de digitação/acentos.
 * 1) tenta filtrar no banco por qualquer termo (nome, sku, subcategoria, categoria, variações)
 * 2) se não achar nada, carrega um lote de produtos e faz a busca aproximada no cliente
 */
export async function searchProductsSmart(
  client: any,
  rawQuery: string,
  limit = 8,
  options: { expandVariations?: boolean } = {}
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

  const variationOr = tokens
    .flatMap((t) => {
      const s = escapeOr(t);
      return [`name.ilike.%${s}%`, `sku.ilike.%${s}%`];
    })
    .join(',');

  const finish = (items: any[]) =>
    options.expandVariations ? expandVariationSuggestions(items, rawQuery, limit) : items;

  let candidates: any[] = [];
  const { data, error } = await base().or(orFilter).limit(60);
  if (!error && data) candidates = data;

  // Produtos cujas variações combinam com a busca
  try {
    const { data: varRows } = await client
      .from('product_variations')
      .select('product_id')
      .or(variationOr)
      .limit(120);
    const ids = Array.from(new Set((varRows ?? []).map((r: any) => r.product_id))).filter(
      (id) => !candidates.some((c) => c.id === id)
    );
    if (ids.length > 0) {
      const { data: extra } = await base().in('id', ids as string[]).limit(40);
      if (extra) candidates = [...candidates, ...extra];
    }
  } catch {
    /* ignora — busca por variação é complementar */
  }

  const ranked = fuzzySearch(candidates, rawQuery, productSearchFields, limit);
  if (ranked.length > 0) return finish(ranked);

  // Fallback aproximado: erros de digitação que o ilike não pega
  const { data: pool, error: poolError } = await base().order('name', { ascending: true }).limit(400);
  if (poolError || !pool) return [];
  return finish(fuzzySearch(pool, rawQuery, productSearchFields, limit));
}

