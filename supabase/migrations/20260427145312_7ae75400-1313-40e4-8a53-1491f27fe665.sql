-- Reset products visibility to a clean column-grant model

-- Drop the view we made (we'll recreate)
DROP VIEW IF EXISTS public.products_public;
DROP VIEW IF EXISTS public.products_admin;

-- Drop both SELECT policies and replace with one permissive policy.
-- Column-level GRANTs will enforce the actual field visibility.
DROP POLICY IF EXISTS "Admins e employees podem ver produtos" ON public.products;
DROP POLICY IF EXISTS "Public can read products via view" ON public.products;
DROP POLICY IF EXISTS "Todos podem ver produtos" ON public.products;

CREATE POLICY "Todos podem ver produtos"
ON public.products
FOR SELECT
TO public
USING (true);

-- Reset table-level grants and apply column-level grants for SELECT.
REVOKE ALL ON public.products FROM anon, authenticated;

-- All other operations (INSERT/UPDATE/DELETE) still need table-level perms for
-- admins/employees, gated by their existing RLS write policies.
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;

-- Customer-safe columns: granted to both anon (visitors) and authenticated (customers).
GRANT SELECT (
  id, name, description, short_description, price, category, subcategory,
  brand, size, pound_test, image_url, images, rating, stock, featured,
  on_sale, sale_price, sale_ends_at, minimum_quantity, sku, sold_by_weight,
  weight_grams, length_cm, width_cm, height_cm, created_at, updated_at,
  ncm, cest, csosn, cfop, origem, unidade_comercial, include_in_nfe
) ON public.products TO anon, authenticated;

-- Sensitive business columns: NOT granted to anon/authenticated.
-- Admins/employees access them via SECURITY DEFINER RPC below.
-- Sensitive columns: cost, price_pdv, price_cash_percent, price_pix_percent,
--   price_debit_percent, price_credit_percent, min_stock, supplier_id, created_by

-- RPC for admins/employees to read full product rows including sensitive fields.
CREATE OR REPLACE FUNCTION public.get_products_admin()
RETURNS SETOF public.products
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'employee'::app_role)) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  RETURN QUERY SELECT * FROM public.products ORDER BY name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_products_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_products_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_product_admin(p_id uuid)
RETURNS SETOF public.products
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'employee'::app_role)) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  RETURN QUERY SELECT * FROM public.products WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_product_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_admin(uuid) TO authenticated;