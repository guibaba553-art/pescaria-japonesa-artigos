ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS pdv_only boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_pdv_only ON public.products(pdv_only) WHERE pdv_only = true;