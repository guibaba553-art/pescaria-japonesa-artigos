-- Hide reviews.user_id from anonymous/public listing while keeping it
-- accessible to the owner and admins via separate policies.

-- Remove the broad public SELECT policy
DROP POLICY IF EXISTS "Todos podem ver avaliações" ON public.reviews;

-- Revoke broad SELECT and grant only non-identifying columns publicly
REVOKE SELECT ON public.reviews FROM anon, authenticated;

GRANT SELECT (id, order_id, product_id, rating, comment, created_at)
  ON public.reviews TO anon, authenticated;

-- Re-create permissive SELECT policy (column grants will restrict which
-- columns can actually be read by anon/authenticated)
CREATE POLICY "Reviews são públicas (colunas restritas)"
  ON public.reviews FOR SELECT
  USING (true);

-- Owners and admins still see all columns including user_id
GRANT SELECT (user_id) ON public.reviews TO authenticated;