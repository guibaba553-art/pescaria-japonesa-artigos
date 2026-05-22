GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variations TO authenticated;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.product_variations TO anon;