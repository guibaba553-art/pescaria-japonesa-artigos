-- Adiciona coluna cancellation_reason na tabela orders
-- Permite armazenar o motivo do cancelamento do pedido
-- Valores esperados: 'prazo_expirado', 'cancelado_admin', ou texto livre

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
