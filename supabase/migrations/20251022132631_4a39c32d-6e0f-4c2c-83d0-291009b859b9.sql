-- Adiciona campo de resumo curto aos produtos
ALTER TABLE products ADD COLUMN IF NOT EXISTS short_description TEXT;

-- Atualiza produtos existentes com resumo vazio
UPDATE products SET short_description = '' WHERE short_description IS NULL;