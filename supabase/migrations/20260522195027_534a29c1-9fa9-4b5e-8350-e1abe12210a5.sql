-- 1) Restrict sensitive columns on products via column-level GRANTs
REVOKE SELECT ON public.products FROM anon, authenticated;
GRANT SELECT (
  id, name, description, short_description, price, category, subcategory, brand,
  size, pound_test, image_url, images, rating, stock, featured, on_sale,
  sale_price, sale_ends_at, sale_limit_qty, sale_sold_qty, min_sale_price,
  minimum_quantity, sku, sold_by_weight, weight_grams, length_cm, width_cm, height_cm,
  created_at, updated_at, created_by, ncm, cest, csosn, cfop, origem,
  unidade_comercial, include_in_nfe, min_stock, pdv_only
) ON public.products TO anon, authenticated;

-- 2) Restrict sensitive columns on product_variations
REVOKE SELECT ON public.product_variations FROM anon, authenticated;
GRANT SELECT (
  id, product_id, name, stock, sku, created_at, updated_at, description,
  price, image_url, weight_grams, length_cm, width_cm, height_cm, min_stock,
  on_sale, sale_price, sale_ends_at, sale_limit_qty, sale_sold_qty, min_sale_price
) ON public.product_variations TO anon, authenticated;

-- 3) Hide reviews.user_id from public; keep other columns readable
REVOKE SELECT ON public.reviews FROM anon, authenticated;
GRANT SELECT (id, order_id, product_id, rating, comment, created_at)
  ON public.reviews TO anon, authenticated;

-- 4) Admin RPC for product variations (mirrors get_products_admin)
CREATE OR REPLACE FUNCTION public.get_product_variations_admin()
RETURNS SETOF public.product_variations
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'employee'::app_role)) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  RETURN QUERY SELECT * FROM public.product_variations ORDER BY product_id, name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_product_variations_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_product_variations_admin() TO authenticated;