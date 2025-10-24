-- Adicionar coluna image_url na tabela product_variations
ALTER TABLE public.product_variations
ADD COLUMN image_url text;

-- Comentário explicativo
COMMENT ON COLUMN public.product_variations.image_url IS 'URL da imagem específica desta variação';