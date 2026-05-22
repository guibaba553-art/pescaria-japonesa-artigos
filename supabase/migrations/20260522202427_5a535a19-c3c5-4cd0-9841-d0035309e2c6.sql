-- Restore SELECT on sensitive columns for authenticated users (admins/employees use select('*')).
-- Anon (public site visitors) still cannot read cost/pricing columns.
GRANT SELECT ON public.product_variations TO authenticated;
GRANT SELECT ON public.products TO authenticated;