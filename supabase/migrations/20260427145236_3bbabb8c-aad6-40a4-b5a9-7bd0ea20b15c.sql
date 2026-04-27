-- Re-grant column-level SELECT on safe product fields to anon and authenticated.
-- The earlier REVOKE removed all grants; we need to put back ONLY the safe columns.

GRANT SELECT (
  id, name, description, short_description, price, category, subcategory,
  brand, size, pound_test, image_url, images, rating, stock, featured,
  on_sale, sale_price, sale_ends_at, minimum_quantity, sku, sold_by_weight,
  weight_grams, length_cm, width_cm, height_cm, created_at, updated_at,
  ncm, cest, csosn, cfop, origem, unidade_comercial, include_in_nfe
) ON public.products TO anon, authenticated;

-- Service role and postgres still have full access via default privileges.
-- Admins/employees can read all columns because they authenticate as 'authenticated'
-- but their RLS policy allows full row access — column GRANTs apply per-role,
-- so they will only see granted columns through PostgREST.
-- To allow admins/employees full column access, we need to either:
--  (a) use a separate role, or
--  (b) expose sensitive fields via a SECURITY DEFINER RPC, or
--  (c) GRANT the sensitive columns to authenticated and rely on RLS to gate row access.
--
-- Since RLS on SELECT for sensitive-column reads can't be column-scoped, and admins
-- need cost/margin data in the admin UI, we GRANT the sensitive columns too but
-- keep them gated behind the admin/employee SELECT policy. Wait — the existing
-- "Public can read products via view" policy is permissive USING (true), which
-- would let anyone read sensitive columns once granted.
--
-- Correct approach: split policies by role. We already have an admin/employee SELECT
-- policy. Drop the permissive one and instead let the column-grant + a row-permissive
-- policy work for safe columns only. For admin sensitive columns, they read the table
-- directly with their own role - but PostgREST uses the JWT 'authenticated' role.
--
-- Simplest robust solution: GRANT all columns to authenticated, and for anon GRANT
-- only safe columns. The RLS policy USING(true) lets both read rows. Anon physically
-- cannot select sensitive columns due to lack of grant. Authenticated CAN select
-- sensitive columns — so non-admin logged-in customers could see cost.
--
-- To prevent that, we need the RLS to be split. PostgreSQL doesn't support column-level
-- RLS, but we can use a security_invoker view for admins that exposes the sensitive
-- columns, OR we keep authenticated grants narrow too and have admins use a separate
-- admin-only view/RPC.

-- Step: keep authenticated narrow as well (do not grant sensitive columns).
-- Admins/employees will read sensitive product data via a new admin view.

-- Create an admin-only view exposing ALL columns including sensitive ones.
CREATE OR REPLACE VIEW public.products_admin
WITH (security_invoker = on)
AS
SELECT * FROM public.products;

-- Only admins/employees may read this view (enforced via the underlying RLS policy on products).
-- We need a policy that lets admins/employees read all columns. The existing
-- "Admins e employees podem ver produtos" policy allows row access; column grants
-- on the base table to authenticated cover the safe columns. For full columns,
-- admins must query through a SECURITY DEFINER function or we GRANT all cols.

-- Pragmatic decision: GRANT ALL columns to a custom approach is complex.
-- Instead: drop the column-restricted strategy and use TWO views:
--   - products_public: safe cols, anyone can read (security_invoker = off, owner-bypass)
--   - the base products table: admins/employees only via RLS

-- Drop the permissive USING(true) policy and column grants approach.
DROP POLICY IF EXISTS "Public can read products via view" ON public.products;
REVOKE SELECT ON public.products FROM anon, authenticated;

-- Grant full table access back to authenticated (admins/employees gated by RLS policy).
GRANT SELECT ON public.products TO authenticated;

-- Make products_public a security-definer-style view (owner bypass) so anon can read
-- safe columns regardless of base table RLS. Mark it security_barrier to prevent leaks.
DROP VIEW IF EXISTS public.products_public;
DROP VIEW IF EXISTS public.products_admin;

CREATE VIEW public.products_public
WITH (security_invoker = off, security_barrier = true)
AS
SELECT
  id, name, description, short_description, price, category, subcategory,
  brand, size, pound_test, image_url, images, rating, stock, featured,
  on_sale, sale_price, sale_ends_at, minimum_quantity, sku, sold_by_weight,
  weight_grams, length_cm, width_cm, height_cm, created_at, updated_at,
  ncm, cest, csosn, cfop, origem, unidade_comercial, include_in_nfe
FROM public.products;

GRANT SELECT ON public.products_public TO anon, authenticated;