
-- ============================================================
-- Sistema de classificação de clientes (score / tiers / eventos)
-- ============================================================

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS score integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_customers_score ON public.customers(score);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS return_is_defect boolean NOT NULL DEFAULT false;

-- Tabela de faixas (tiers) configuráveis
CREATE TABLE IF NOT EXISTS public.customer_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  min_score integer NOT NULL,
  max_score integer,                          -- NULL = sem teto
  discount_percent numeric NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  block_purchase boolean NOT NULL DEFAULT false,
  allow_discount boolean NOT NULL DEFAULT true,
  perks text,
  color text NOT NULL DEFAULT '#64748b',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_customer_tiers_updated_at
  BEFORE UPDATE ON public.customer_tiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

ALTER TABLE public.customer_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tiers visíveis a admin/employee"
  ON public.customer_tiers FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'employee'::app_role));

CREATE POLICY "Admin gerencia tiers"
  ON public.customer_tiers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- Eventos de pontuação (histórico)
CREATE TABLE IF NOT EXISTS public.customer_score_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  points_delta integer NOT NULL,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'manual',     -- manual | order_delivered | order_returned | adjustment
  order_id uuid,                              -- pedido relacionado (se houver)
  performed_by uuid,                          -- auth.uid quando manual
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, source)                   -- idempotência por pedido+fonte
);

CREATE INDEX IF NOT EXISTS idx_score_events_customer ON public.customer_score_events(customer_id, created_at DESC);

ALTER TABLE public.customer_score_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eventos visíveis a admin/employee"
  ON public.customer_score_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'employee'::app_role));

CREATE POLICY "Admin/employee inserem eventos"
  ON public.customer_score_events FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'employee'::app_role));

CREATE POLICY "Admin gerencia eventos"
  ON public.customer_score_events FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- Função utilitária: aplica delta + insere evento, atualiza customers.score
CREATE OR REPLACE FUNCTION public.add_customer_score(
  p_customer_id uuid,
  p_delta integer,
  p_reason text,
  p_source text DEFAULT 'manual',
  p_order_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_event_id uuid;
  v_new_score integer;
BEGIN
  v_user := auth.uid();

  IF NOT (has_role(v_user,'admin'::app_role) OR has_role(v_user,'employee'::app_role)
          OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Sem permissão para alterar pontuação';
  END IF;

  -- Idempotência por (order_id, source) — evita duplicar pontos por trigger
  IF p_order_id IS NOT NULL THEN
    SELECT id INTO v_event_id FROM public.customer_score_events
      WHERE order_id = p_order_id AND source = p_source LIMIT 1;
    IF v_event_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'skipped', true);
    END IF;
  END IF;

  INSERT INTO public.customer_score_events
    (customer_id, points_delta, reason, source, order_id, performed_by)
  VALUES
    (p_customer_id, p_delta, p_reason, p_source, p_order_id, v_user)
  RETURNING id INTO v_event_id;

  UPDATE public.customers
    SET score = COALESCE(score,0) + p_delta
    WHERE id = p_customer_id
    RETURNING score INTO v_new_score;

  RETURN jsonb_build_object('success', true, 'event_id', v_event_id, 'new_score', v_new_score);
END;
$$;

-- Trigger nos pedidos: aplica pontos quando muda status
CREATE OR REPLACE FUNCTION public.handle_order_score_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cust uuid;
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_cust := NEW.customer_id;

  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Compra concluída => +1
  IF NEW.status IN ('entregado','retirado') THEN
    PERFORM public.add_customer_score(
      v_cust, 1,
      'Compra concluída (' || NEW.status || ')',
      'order_delivered', NEW.id
    );
  END IF;

  -- Devolução SEM defeito => -1 (defeito não desconta)
  IF NEW.status = 'devolvido' AND COALESCE(NEW.return_is_defect,false) = false THEN
    PERFORM public.add_customer_score(
      v_cust, -1,
      'Devolução sem defeito',
      'order_returned', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_customer_score ON public.orders;
CREATE TRIGGER trg_orders_customer_score
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_score_change();

-- Seed das faixas padrão (idempotente)
INSERT INTO public.customer_tiers
  (name, min_score, max_score, discount_percent, block_purchase, allow_discount, perks, color, sort_order)
VALUES
  ('Bloqueado',  -1000000, -5,   0, true,  false, 'Venda bloqueada — exige aprovação do admin',           '#dc2626', 0),
  ('Restrito',   -4,        0,   0, false, false, 'Sem direito a descontos ou cupons',                    '#f97316', 1),
  ('Bronze',      1,       10,   0, false, true,  'Cliente regular',                                       '#a16207', 2),
  ('Prata',      11,       30,   5, false, true,  '5% de desconto automático no PDV',                      '#94a3b8', 3),
  ('Ouro',       31,      100,  10, false, true,  '10% de desconto + brinde a cada compra',                '#eab308', 4),
  ('Diamante',  101,     NULL,  15, false, true,  '15% de desconto + brinde + atendimento prioritário',    '#0ea5e9', 5)
ON CONFLICT (name) DO NOTHING;
