-- Restrict public SELECT on products to non-sensitive columns only.
-- Revoke broad SELECT from anon/authenticated and grant only safe columns.
-- Sensitive columns (cost, supplier_id, price_pdv, price_*_percent, pdv_no_markup, pdv_only)
-- remain accessible only via the SECURITY DEFINER RPC `get_products_admin`.

REVOKE SELECT ON public.products FROM anon, authenticated;

GRANT SELECT (
  id, name, description, short_description, price, category, subcategory,
  brand, size, pound_test, image_url, images, rating, stock, featured,
  on_sale, sale_price, sale_ends_at, minimum_quantity, sku, sold_by_weight,
  weight_grams, length_cm, width_cm, height_cm, created_at, updated_at,
  ncm, cest, csosn, cfop, origem, unidade_comercial, include_in_nfe, min_stock
) ON public.products TO anon, authenticated;