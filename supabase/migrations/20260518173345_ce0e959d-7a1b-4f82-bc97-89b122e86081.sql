DROP TRIGGER IF EXISTS trg_enforce_min_sale_price_products ON public.products;
DROP TRIGGER IF EXISTS trg_enforce_min_sale_price_variations ON public.product_variations;
DROP FUNCTION IF EXISTS public.enforce_min_sale_price();