-- Adicionar campos para produtos em destaque e promoções
ALTER TABLE public.products
ADD COLUMN featured boolean NOT NULL DEFAULT false,
ADD COLUMN on_sale boolean NOT NULL DEFAULT false,
ADD COLUMN sale_price numeric,
ADD COLUMN sale_ends_at timestamp with time zone;

-- Criar índice para produtos em destaque
CREATE INDEX idx_products_featured ON public.products(featured) WHERE featured = true;

-- Criar índice para produtos em promoção
CREATE INDEX idx_products_on_sale ON public.products(on_sale) WHERE on_sale = true;