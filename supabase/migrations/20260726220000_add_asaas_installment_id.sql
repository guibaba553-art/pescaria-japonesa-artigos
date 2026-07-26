-- Adicionar coluna para armazenar o ID do parcelamento (installment) do Asaas
-- Usado para estorno de pagamentos via cartão de crédito, que exigem
-- o endpoint /v3/installments/{id}/refund ao invés de /v3/payments/{id}/refund
ALTER TABLE orders ADD COLUMN IF NOT EXISTS asaas_installment_id TEXT;
