-- Adicionar campo para controlar se produto vai na NF-e
ALTER TABLE products 
ADD COLUMN include_in_nfe BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN products.include_in_nfe IS 'Se false, o valor do produto será adicionado como taxa adicional na NF-e ao invés de item';