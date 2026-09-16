ALTER TABLE public.cash_registers
  ADD COLUMN opening_denominations jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN closing_denominations jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.cash_registers.opening_denominations IS 'Quantidade de cédulas e moedas informada na abertura do caixa';
COMMENT ON COLUMN public.cash_registers.closing_denominations IS 'Quantidade de cédulas e moedas informada no fechamento do caixa';