ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sale_price_pdv numeric;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS sale_price_pdv numeric;