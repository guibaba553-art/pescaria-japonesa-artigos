-- Adicionar campo de código de barras/SKU aos produtos
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS sku text UNIQUE;

-- Criar índice para busca rápida por SKU
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);

-- Adicionar comentário explicativo
COMMENT ON COLUMN public.products.sku IS 'Código de barras/SKU do produto para leitura rápida no PDV';