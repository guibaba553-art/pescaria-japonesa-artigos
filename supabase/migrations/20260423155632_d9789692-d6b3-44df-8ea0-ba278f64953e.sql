
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS pound_test TEXT,
  ADD COLUMN IF NOT EXISTS size TEXT;

CREATE INDEX IF NOT EXISTS idx_products_brand ON public.products(brand);
CREATE INDEX IF NOT EXISTS idx_products_pound_test ON public.products(pound_test);
CREATE INDEX IF NOT EXISTS idx_products_size ON public.products(size);
