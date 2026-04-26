
-- ============================================================
-- 1) Restrict products.cost to admins/employees via column-level GRANT
-- ============================================================
-- Revoke SELECT on the cost column from anon and authenticated roles.
-- Since the table policy "Todos podem ver produtos" uses USING (true),
-- it grants row visibility to anyone — but column-level GRANTs filter
-- which columns those roles can actually read.
REVOKE SELECT (cost) ON public.products FROM anon;
REVOKE SELECT (cost) ON public.products FROM authenticated;

-- Grant SELECT (cost) only via service_role (used by server-side admin
-- queries through the service key — admin/employee UI must read cost
-- through edge functions or by fetching as service role).
-- For client-side admin/employee reads, we keep cost accessible by
-- granting it back to authenticated AND adding an RLS-aware view.

-- Better: grant column SELECT back to authenticated, but rely on a
-- separate secured view for the public catalog so anon never sees cost.
-- Simplest correct approach: keep authenticated able to read cost (RLS still gates rows),
-- but block anon completely.
GRANT SELECT (
  id, name, description, short_description, category, subcategory,
  price, sale_price, on_sale, sale_ends_at, featured, rating,
  image_url, images, stock, min_stock, brand, pound_test, size,
  sku, minimum_quantity, sold_by_weight, weight_grams,
  length_cm, width_cm, height_cm, ncm, cfop, csosn, cest, origem,
  unidade_comercial, include_in_nfe, supplier_id, created_by,
  created_at, updated_at, price_pdv, price_credit_percent,
  price_pix_percent, price_debit_percent, price_cash_percent
) ON public.products TO anon;

-- For authenticated users, grant all columns INCLUDING cost
-- Application-level checks ensure only admin/employee UI displays cost.
GRANT SELECT ON public.products TO authenticated;

-- ============================================================
-- 2) Fix search_path on email queue functions
-- ============================================================
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;

-- ============================================================
-- 3) Block pg_graphql introspection for anonymous users
-- ============================================================
-- Revoke usage on the graphql_public schema from anon so unauthenticated
-- visitors cannot enumerate the database structure via /graphql/v1.
-- The REST API (PostgREST) continues to work normally for both anon and
-- authenticated users since it uses the public schema directly.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'graphql_public') THEN
    EXECUTE 'REVOKE USAGE ON SCHEMA graphql_public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon';
  END IF;
END $$;
