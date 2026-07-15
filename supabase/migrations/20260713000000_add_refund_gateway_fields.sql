-- Adicionar colunas gateway-agnostic à tabela de reembolsos
-- Suporta Asaas, AbacatePay, Mercado Pago e qualquer gateway futuro

ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS gateway TEXT;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS gateway_refund_id TEXT;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS gateway_response JSONB;

-- Migrar dados existentes do Mercado Pago para os novos campos
UPDATE payment_refunds SET gateway = 'mercadopago' WHERE mp_refund_id IS NOT NULL AND gateway IS NULL;
UPDATE payment_refunds SET gateway_refund_id = mp_refund_id WHERE mp_refund_id IS NOT NULL AND gateway_refund_id IS NULL;

-- Índices para consultas comuns
CREATE INDEX IF NOT EXISTS idx_payment_refunds_gateway ON payment_refunds(gateway);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_status ON payment_refunds(status);
