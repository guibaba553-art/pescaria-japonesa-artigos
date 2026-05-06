ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tef_transaction_id UUID REFERENCES public.tef_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS card_brand TEXT,
  ADD COLUMN IF NOT EXISTS card_last_digits TEXT,
  ADD COLUMN IF NOT EXISTS nsu TEXT,
  ADD COLUMN IF NOT EXISTS authorization_code TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_tef_transaction ON public.orders(tef_transaction_id);