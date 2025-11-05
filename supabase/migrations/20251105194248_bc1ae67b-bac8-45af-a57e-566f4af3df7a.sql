-- Adicionar campo de quantidade mínima para venda
ALTER TABLE public.products
ADD COLUMN minimum_quantity integer DEFAULT 1 NOT NULL;

-- Adicionar comentário explicativo
COMMENT ON COLUMN public.products.minimum_quantity IS 'Quantidade mínima que deve ser comprada deste produto (ex: 10 tuviras)';