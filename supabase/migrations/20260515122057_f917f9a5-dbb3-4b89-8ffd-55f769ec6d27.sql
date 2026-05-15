ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tax_pct numeric NOT NULL DEFAULT 0;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS tax_pct numeric NOT NULL DEFAULT 0;