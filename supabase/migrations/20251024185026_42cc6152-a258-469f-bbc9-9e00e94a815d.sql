-- Remover coluna value e transformar price_adjustment em price direto
ALTER TABLE public.product_variations DROP COLUMN value;
ALTER TABLE public.product_variations DROP COLUMN price_adjustment;
ALTER TABLE public.product_variations ADD COLUMN price numeric NOT NULL DEFAULT 0;