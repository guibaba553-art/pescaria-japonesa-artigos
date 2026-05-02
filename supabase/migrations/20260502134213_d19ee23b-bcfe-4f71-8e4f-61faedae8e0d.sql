ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.product_variations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_variations;