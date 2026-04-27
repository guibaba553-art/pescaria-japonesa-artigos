-- Switch view back to security_invoker = on (respects caller's RLS) and rely on column-level GRANTs

ALTER VIEW public.products_public SET (security_invoker = on);

-- Restore a public SELECT policy on products so the view can read rows.
-- Column-level GRANTs below will hide sensitive columns from anon/authenticated.
DROP POLICY IF EXISTS "Public can read products via view" ON public.products;
CREATE POLICY "Public can read products via view"
ON public.products
FOR SELECT
TO public
USING (true);

-- Revoke broad column access from anon/authenticated, then grant only safe columns.
-- Admins/employees still get everything via the dedicated policy + role grants.
REVOKE SELECT ON public.products FROM anon, authenticated;

GRANT SELECT (
  id, name, description, short_description, price, category, subcategory,
  brand, size, pound_test, image_url, images, rating, stock, featured,
  on_sale, sale_price, sale_ends_at, minimum_quantity, sku, sold_by_weight,
  weight_grams, length_cm, width_cm, height_cm, created_at, updated_at,
  ncm, cest, csosn, cfop, origem, unidade_comercial, include_in_nfe
) ON public.products TO anon, authenticated;

-- Sensitive columns NOT granted to anon/authenticated:
--   cost, price_pdv, price_cash_percent, price_pix_percent,
--   price_debit_percent, price_credit_percent, min_stock, supplier_id, created_by