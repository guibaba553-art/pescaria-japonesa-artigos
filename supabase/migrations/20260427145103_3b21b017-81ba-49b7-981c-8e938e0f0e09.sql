-- Restrict products table SELECT to admins/employees, expose public view without sensitive fields

-- 1. Drop the existing public SELECT policy
DROP POLICY IF EXISTS "Todos podem ver produtos" ON public.products;

-- 2. Create a restricted SELECT policy for admins/employees only on the base table
CREATE POLICY "Admins e employees podem ver produtos"
ON public.products
FOR SELECT
TO public
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

-- 3. Create a public view exposing ONLY customer-facing fields (no cost, margins, supplier, internal pricing)
CREATE OR REPLACE VIEW public.products_public
WITH (security_invoker = on)
AS
SELECT
  id,
  name,
  description,
  short_description,
  price,
  category,
  subcategory,
  brand,
  size,
  pound_test,
  image_url,
  images,
  rating,
  stock,
  featured,
  on_sale,
  sale_price,
  sale_ends_at,
  minimum_quantity,
  sku,
  sold_by_weight,
  weight_grams,
  length_cm,
  width_cm,
  height_cm,
  created_at,
  updated_at
FROM public.products;

-- 4. Allow anyone (including anon) to read the safe view
GRANT SELECT ON public.products_public TO anon, authenticated;

-- 5. Add a permissive SELECT policy on products for the view to work for anon users
-- The view uses security_invoker, so it respects the caller's RLS. We need a
-- policy that allows anon/authenticated to SELECT only non-sensitive columns.
-- Since RLS is row-level (not column), we instead make the view SECURITY DEFINER-like
-- by switching to security_invoker = off so the view bypasses RLS on the base table
-- and only the view's GRANT controls access.
ALTER VIEW public.products_public SET (security_invoker = off);