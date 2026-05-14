ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS shipping_label_order_id TEXT,
ADD COLUMN IF NOT EXISTS shipping_label_url TEXT;