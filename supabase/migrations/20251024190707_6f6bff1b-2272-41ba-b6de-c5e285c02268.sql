-- Atualizar categoria de "Acessórios" para "Variedades"
UPDATE products 
SET category = 'Variedades' 
WHERE category = 'Acessórios';