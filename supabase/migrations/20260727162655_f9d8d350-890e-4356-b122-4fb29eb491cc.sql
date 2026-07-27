ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sale_starts_at timestamptz;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS sale_starts_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_products_sale_starts_at ON public.products(sale_starts_at) WHERE sale_starts_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_variations_sale_starts_at ON public.product_variations(sale_starts_at) WHERE sale_starts_at IS NOT NULL;