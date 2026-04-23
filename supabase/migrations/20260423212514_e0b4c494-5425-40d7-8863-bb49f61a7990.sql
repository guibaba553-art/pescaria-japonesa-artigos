ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS variation_id uuid REFERENCES public.product_variations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_variation_id ON public.order_items(variation_id);