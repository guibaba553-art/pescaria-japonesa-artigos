import { supabase as supabaseType } from '@/integrations/supabase/client';
import { Product } from '@/types/product';

export async function searchProductsFallback(
  client: typeof supabaseType,
  searchQuery: string,
  selectedCategory: string,
  limit = 12
): Promise<Product[]> {
  if (!searchQuery.trim() && selectedCategory === 'all') {
    return [];
  }

  let query = client
    .from('products')
    .select(`
      id, name, price, sale_price, on_sale, sale_ends_at, sale_limit_qty, sale_sold_qty, min_sale_price,
      category, subcategory, brand_id, brands(name),
      image_url, stock, rating, featured, minimum_quantity,
      sold_by_weight, created_at,
      variations:product_variations(id, name, price, stock, image_url, on_sale, sale_price, sale_ends_at, sale_limit_qty, sale_sold_qty, min_sale_price)
    `)
    .eq('pdv_only', false)
    .gt('stock', 0);

  if (searchQuery.trim()) {
    query = query.ilike('name', `%${searchQuery}%`);
  }

  if (selectedCategory !== 'all') {
    query = query.eq('category', selectedCategory);
  }

  try {
    const { data, error } = await query.order('name', { ascending: true }).limit(limit);

    if (error || !data) {
      return [];
    }

    const mapped = data.map((row: any) => ({
      ...row,
      brand: row.brands?.name ?? null,
    }));

    return mapped as unknown as Product[];
  } catch {
    return [];
  }
}
