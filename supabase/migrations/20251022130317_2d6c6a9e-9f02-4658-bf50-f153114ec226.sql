-- Adicionar campo de estoque nos produtos
ALTER TABLE public.products
ADD COLUMN stock INTEGER NOT NULL DEFAULT 0;

-- Criar índice para melhor performance ao filtrar por estoque
CREATE INDEX idx_products_stock ON public.products(stock);