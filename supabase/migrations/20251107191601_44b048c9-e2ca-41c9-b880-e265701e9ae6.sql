-- Adicionar coluna tipo para diferenciar NFe de entrada e saída
ALTER TABLE nfe_emissions 
ADD COLUMN tipo TEXT NOT NULL DEFAULT 'saida' CHECK (tipo IN ('entrada', 'saida'));

-- Adicionar coluna fornecedor para NFes de entrada
ALTER TABLE nfe_emissions 
ADD COLUMN fornecedor_nome TEXT,
ADD COLUMN fornecedor_cnpj TEXT;

-- Criar índice para melhor performance nas consultas por tipo
CREATE INDEX idx_nfe_emissions_tipo ON nfe_emissions(tipo);

-- Comentários para documentação
COMMENT ON COLUMN nfe_emissions.tipo IS 'Tipo da NFe: entrada (compra) ou saida (venda)';
COMMENT ON COLUMN nfe_emissions.fornecedor_nome IS 'Nome do fornecedor (apenas para NFes de entrada)';
COMMENT ON COLUMN nfe_emissions.fornecedor_cnpj IS 'CNPJ do fornecedor (apenas para NFes de entrada)';