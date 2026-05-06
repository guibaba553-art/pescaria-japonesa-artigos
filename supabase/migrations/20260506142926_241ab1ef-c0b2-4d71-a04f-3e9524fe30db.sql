-- 1) products: revoke broad SELECT and restore safe column grants
REVOKE SELECT ON public.products FROM anon, authenticated;

GRANT SELECT (
  id, name, description, short_description, price, category, subcategory,
  brand, size, pound_test, image_url, images, rating, stock, featured,
  on_sale, sale_price, sale_ends_at, minimum_quantity, sku, sold_by_weight,
  weight_grams, length_cm, width_cm, height_cm, created_at, updated_at,
  ncm, cest, csosn, cfop, origem, unidade_comercial, include_in_nfe, min_stock
) ON public.products TO anon, authenticated;

-- 2) reviews: revoke user_id read access from regular users
REVOKE SELECT (user_id) ON public.reviews FROM authenticated;
REVOKE SELECT (user_id) ON public.reviews FROM anon;

-- 3) RPC so users can still know which products they've reviewed
CREATE OR REPLACE FUNCTION public.get_my_reviewed_products()
RETURNS TABLE (order_id uuid, product_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT order_id, product_id
  FROM public.reviews
  WHERE user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_reviewed_products() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_reviewed_products() TO authenticated;