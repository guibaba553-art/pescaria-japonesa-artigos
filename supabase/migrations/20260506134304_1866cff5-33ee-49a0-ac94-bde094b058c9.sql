ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_pdv_pix numeric NULL,
  ADD COLUMN IF NOT EXISTS price_pdv_cash numeric NULL,
  ADD COLUMN IF NOT EXISTS price_pdv_debit numeric NULL,
  ADD COLUMN IF NOT EXISTS price_pdv_credit numeric NULL;