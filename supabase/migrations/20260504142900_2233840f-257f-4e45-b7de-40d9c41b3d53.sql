ALTER TABLE public.dismissed_stock_alerts DROP CONSTRAINT IF EXISTS dismissed_stock_alerts_product_id_key;
ALTER TABLE public.dismissed_stock_alerts ADD COLUMN IF NOT EXISTS variation_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS dismissed_stock_alerts_unique
  ON public.dismissed_stock_alerts (product_id, COALESCE(variation_id, '00000000-0000-0000-0000-000000000000'::uuid));