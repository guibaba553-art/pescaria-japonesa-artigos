-- 1) Restrict SELECT on products — only safe columns for anon/authenticated
-- Columns must match src/utils/productColumns.ts PUBLIC_PRODUCT_COLUMNS exactly.
REVOKE SELECT ON public.products FROM anon, authenticated;

GRANT SELECT (
  id, name, description, short_description, price, category, subcategory, brand_id,
  size, pound_test, image_url, images, rating, stock, featured, on_sale,
  sale_price, sale_starts_at, sale_ends_at, sale_limit_qty, sale_sold_qty, min_sale_price,
  minimum_quantity, sku, sold_by_weight, weight_grams, length_cm, width_cm, height_cm,
  created_at, updated_at, ncm, cest, csosn, cfop, origem, unidade_comercial,
  include_in_nfe, pdv_only, sale_channel
) ON public.products TO anon, authenticated;

-- Colunas concedidas na migração 20260522195027 que NÃO estão na lista pública
-- acima (created_by, min_stock). Sem este REVOKE column-level, o GRANT anterior
-- continuaria legível mesmo após o REVOKE table-level.
REVOKE SELECT (created_by, min_stock) ON public.products FROM anon, authenticated;

-- 2) Restrict SELECT on product_variations — only safe columns for anon/authenticated
REVOKE SELECT ON public.product_variations FROM anon, authenticated;

GRANT SELECT (
  id, product_id, name, price, stock, sku, created_at, updated_at, description,
  image_url, weight_grams, length_cm, width_cm, height_cm, min_stock,
  on_sale, sale_price, sale_starts_at, sale_ends_at, sale_limit_qty, sale_sold_qty, min_sale_price, sale_channel
) ON public.product_variations TO anon, authenticated;

-- 3) RPC for admin/employee to read ALL columns of variations for a specific product
CREATE OR REPLACE FUNCTION public.get_product_variations_by_product(p_product_id uuid)
RETURNS SETOF public.product_variations
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'employee'::app_role)) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  RETURN QUERY SELECT * FROM public.product_variations WHERE product_id = p_product_id ORDER BY name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_product_variations_by_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_variations_by_product(uuid) TO authenticated;
