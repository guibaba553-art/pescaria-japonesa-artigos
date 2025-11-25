-- Adicionar campo para produtos vendidos por peso/quilo
ALTER TABLE public.products
ADD COLUMN sold_by_weight boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.sold_by_weight IS 'Indica se o produto é vendido por peso/quilo (aceita quantidade decimal)';