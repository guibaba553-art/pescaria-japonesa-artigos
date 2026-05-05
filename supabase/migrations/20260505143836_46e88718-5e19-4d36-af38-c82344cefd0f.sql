-- Restore SELECT access on products. Previous column-level grants broke the public storefront.
-- RLS still controls row access via the existing "Todos podem ver produtos" policy.
GRANT SELECT ON public.products TO anon, authenticated;