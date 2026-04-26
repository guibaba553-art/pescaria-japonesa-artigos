-- Adicionar dimensões e peso aos produtos para cálculo correto de frete
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS weight_grams INTEGER,
  ADD COLUMN IF NOT EXISTS length_cm NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS width_cm NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC(6,2);

COMMENT ON COLUMN public.products.weight_grams IS 'Peso do produto em gramas (para cálculo de frete via Melhor Envio)';
COMMENT ON COLUMN public.products.length_cm IS 'Comprimento em cm (mínimo 11 para Melhor Envio)';
COMMENT ON COLUMN public.products.width_cm IS 'Largura em cm (mínimo 11 para Melhor Envio)';
COMMENT ON COLUMN public.products.height_cm IS 'Altura em cm (mínimo 2 para Melhor Envio)';