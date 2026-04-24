-- Adiciona campos de precificação por método de pagamento no PDV
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_pdv numeric,
  ADD COLUMN IF NOT EXISTS price_credit_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_debit_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_pix_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_cash_percent numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.products.price_pdv IS 'Preço base usado no PDV. Se NULL, usa price (preço do site).';
COMMENT ON COLUMN public.products.price_credit_percent IS 'Acréscimo (+) ou desconto (-) percentual sobre price_pdv para pagamento em crédito';
COMMENT ON COLUMN public.products.price_debit_percent IS 'Acréscimo (+) ou desconto (-) percentual sobre price_pdv para pagamento em débito';
COMMENT ON COLUMN public.products.price_pix_percent IS 'Acréscimo (+) ou desconto (-) percentual sobre price_pdv para pagamento em PIX';
COMMENT ON COLUMN public.products.price_cash_percent IS 'Acréscimo (+) ou desconto (-) percentual sobre price_pdv para pagamento em dinheiro';