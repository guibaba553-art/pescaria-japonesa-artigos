-- Asaas fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS asaas_customer_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_attempts integer DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_payment_attempt_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_due_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_fee integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_url text;
ALTER TABLE saved_payment_methods ADD COLUMN IF NOT EXISTS asaas_credit_card_token text;
CREATE INDEX IF NOT EXISTS idx_orders_pending_payment ON orders (status, created_at) WHERE status = 'aguardando_pagamento';

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);

-- PIX attempts + payment_received_at + cancellation_reason
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pix_attempts integer DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_orders_pix_attempts ON orders (pix_attempts) WHERE status = 'aguardando_pagamento';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_received_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- pronto_retirada status
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'pronto_retirada';

-- Remove delete policies on orders
DROP POLICY IF EXISTS "Admins podem deletar pedidos" ON public.orders;
DROP POLICY IF EXISTS "Admins podem deletar itens de pedidos" ON public.order_items;

-- Brands table
CREATE TABLE IF NOT EXISTS public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brands_name ON public.brands(name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios autenticados podem ver marcas" ON public.brands;
CREATE POLICY "Usuarios autenticados podem ver marcas" ON public.brands FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins e funcionarios podem criar marcas" ON public.brands;
CREATE POLICY "Admins e funcionarios podem criar marcas" ON public.brands FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));
DROP POLICY IF EXISTS "Admins e funcionarios podem atualizar marcas" ON public.brands;
CREATE POLICY "Admins e funcionarios podem atualizar marcas" ON public.brands FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));
DROP POLICY IF EXISTS "Admins podem deletar marcas" ON public.brands;
CREATE POLICY "Admins podem deletar marcas" ON public.brands FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_brands_updated_at ON public.brands;
CREATE TRIGGER trg_brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

INSERT INTO public.brands (name)
SELECT DISTINCT brand FROM public.products WHERE brand IS NOT NULL AND brand != ''
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL;
UPDATE public.products SET brand_id = b.id FROM public.brands b
WHERE public.products.brand IS NOT NULL AND public.products.brand = b.name AND public.products.brand_id IS NULL;
ALTER TABLE public.products DROP COLUMN IF EXISTS brand;
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON public.products(brand_id) WHERE brand_id IS NOT NULL;

-- Refund gateway fields
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS gateway TEXT;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS gateway_refund_id TEXT;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS gateway_response JSONB;
UPDATE payment_refunds SET gateway = 'mercadopago' WHERE mp_refund_id IS NOT NULL AND gateway IS NULL;
UPDATE payment_refunds SET gateway_refund_id = mp_refund_id WHERE mp_refund_id IS NOT NULL AND gateway_refund_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_refunds_gateway ON payment_refunds(gateway);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_status ON payment_refunds(status);

-- Validate order status transition (final version, includes pronto_retirada + retirado→devolvido)
CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_old_status order_status;
BEGIN
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  v_old_status := OLD.status;
  IF v_old_status = NEW.status THEN RETURN NEW; END IF;
  IF v_old_status = 'aguardando_pagamento' AND NEW.status IN ('em_preparo','cancelado') THEN RETURN NEW; END IF;
  IF v_old_status = 'em_preparo' AND NEW.status IN ('aguardando_envio','pronto_retirada','retirado','cancelado') THEN RETURN NEW; END IF;
  IF v_old_status = 'pronto_retirada' AND NEW.status IN ('retirado','cancelado') THEN RETURN NEW; END IF;
  IF v_old_status = 'aguardando_envio' AND NEW.status IN ('enviado','em_preparo','cancelado') THEN RETURN NEW; END IF;
  IF v_old_status = 'enviado' AND NEW.status IN ('entregado','cancelado') THEN RETURN NEW; END IF;
  IF v_old_status IN ('entregado','retirado') AND NEW.status = 'cancelado' THEN RETURN NEW; END IF;
  IF v_old_status IN ('entregado','retirado') AND NEW.status = 'devolucao_solicitada' THEN RETURN NEW; END IF;
  IF v_old_status = 'devolucao_solicitada' AND NEW.status = 'devolvido' THEN RETURN NEW; END IF;
  IF v_old_status = 'retirado' AND NEW.status = 'devolvido' THEN RETURN NEW; END IF;
  IF v_old_status = 'devolucao_solicitada' AND NEW.status IN ('entregado','retirado') THEN RETURN NEW; END IF;
  IF v_old_status IN ('devolvido','cancelado') THEN
    RAISE EXCEPTION 'Não é possível alterar status de pedidos finalizados';
  END IF;
  RAISE EXCEPTION 'Transição de status inválida de % para %', v_old_status, NEW.status;
END; $$;

-- Cron: cancel expired orders every 5 min
DO $migration$
BEGIN
  BEGIN PERFORM cron.unschedule('cancel-expired-orders-every-5-min');
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'unschedule skipped: %', SQLERRM; END;
  BEGIN
    PERFORM cron.schedule(
      'cancel-expired-orders-every-5-min','*/5 * * * *',
      $cronjob$
      SELECT net.http_post(
        url := 'http://127.0.0.1:54321/functions/v1/cancel-expired-orders',
        headers := jsonb_build_object('Content-Type','application/json',
          'x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret' LIMIT 1)),
        body := '{}'::jsonb);
      $cronjob$);
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'schedule skipped: %', SQLERRM; END;
END $migration$;