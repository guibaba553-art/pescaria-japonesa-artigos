
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sale_channel text NOT NULL DEFAULT 'both';
ALTER TABLE public.product_variations
  ADD COLUMN IF NOT EXISTS sale_channel text NOT NULL DEFAULT 'both';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_sale_channel_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_sale_channel_check
  CHECK (sale_channel IN ('site','pdv','both'));

ALTER TABLE public.product_variations
  DROP CONSTRAINT IF EXISTS product_variations_sale_channel_check;
ALTER TABLE public.product_variations
  ADD CONSTRAINT product_variations_sale_channel_check
  CHECK (sale_channel IN ('site','pdv','both'));
