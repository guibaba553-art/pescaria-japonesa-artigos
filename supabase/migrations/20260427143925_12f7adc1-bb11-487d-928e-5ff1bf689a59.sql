ALTER TABLE public.product_variations
ADD COLUMN IF NOT EXISTS weight_grams integer,
ADD COLUMN IF NOT EXISTS length_cm numeric,
ADD COLUMN IF NOT EXISTS width_cm numeric,
ADD COLUMN IF NOT EXISTS height_cm numeric;