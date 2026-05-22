ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sale_limit_qty integer,
  ADD COLUMN IF NOT EXISTS sale_sold_qty integer NOT NULL DEFAULT 0;

ALTER TABLE public.product_variations
  ADD COLUMN IF NOT EXISTS sale_limit_qty integer,
  ADD COLUMN IF NOT EXISTS sale_sold_qty integer NOT NULL DEFAULT 0;