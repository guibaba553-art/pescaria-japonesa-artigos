-- Add a source column to distinguish PDV vs Site orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'site';

-- Backfill: mark existing PDV orders (Venda Presencial or zero CEP) as 'pdv'
UPDATE public.orders
SET source = 'pdv'
WHERE shipping_address = 'Venda Presencial'
   OR shipping_cep = '00000000';

-- Add a check constraint for valid sources
ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_source_check;

ALTER TABLE public.orders
ADD CONSTRAINT orders_source_check CHECK (source IN ('site', 'pdv'));

-- Index for filtering by source
CREATE INDEX IF NOT EXISTS idx_orders_source ON public.orders(source);