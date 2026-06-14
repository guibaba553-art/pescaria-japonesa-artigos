-- Asaas payment gateway integration fields

-- profiles: vincula usuário ao Customer Asaas
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS asaas_customer_id text;

-- orders: dados de pagamento Asaas
ALTER TABLE orders ADD COLUMN IF NOT EXISTS asaas_payment_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_gateway text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_attempts integer DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_payment_attempt_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_due_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_fee integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_url text;

-- saved_payment_methods: token reutilizável Asaas
ALTER TABLE saved_payment_methods ADD COLUMN IF NOT EXISTS asaas_credit_card_token text;

-- índice para consulta de pedidos pendentes
CREATE INDEX IF NOT EXISTS idx_orders_pending_payment
  ON orders (status, created_at)
  WHERE status = 'aguardando_pagamento';

-- Tabela para idempotência de webhooks
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
