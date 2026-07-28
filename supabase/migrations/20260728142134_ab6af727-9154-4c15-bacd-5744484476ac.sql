-- 1) Employee profiles SELECT policy
DROP POLICY IF EXISTS "Funcionários veem todos os perfis" ON public.profiles;
CREATE POLICY "Funcionários veem todos os perfis"
ON public.profiles FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'employee'::app_role));

-- 2) Restrict manual aguardando_pagamento -> em_preparo
CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_old_status order_status;
  v_pending_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source = 'pdv' AND NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role)) THEN
      RAISE EXCEPTION 'Apenas funcionários podem criar pedidos com origem PDV';
    END IF;
    IF NEW.source = 'site' THEN
      SELECT COUNT(*) INTO v_pending_count FROM public.orders
      WHERE user_id = NEW.user_id AND status = 'aguardando_pagamento';
      IF v_pending_count >= 3 THEN
        RAISE EXCEPTION 'Limite de 3 pedidos pendentes atingido. Cancele pedidos anteriores ou aguarde o pagamento.';
      END IF;
      IF EXISTS (SELECT 1 FROM public.orders WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '15 seconds') THEN
        RAISE EXCEPTION 'Aguarde 15 segundos entre pedidos.';
      END IF;
    END IF;
    IF NEW.source = 'site' AND NEW.status != 'aguardando_pagamento' THEN
      RAISE EXCEPTION 'Pedidos do site devem ser criados com status aguardando_pagamento. Status recebido: %', NEW.status;
    END IF;
    IF NEW.source = 'pdv' AND NEW.status != 'entregado' THEN
      RAISE EXCEPTION 'Pedidos do PDV devem ser criados com status entregado. Status recebido: %', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  v_old_status := OLD.status;
  IF v_old_status = NEW.status THEN RETURN NEW; END IF;

  IF v_old_status = 'aguardando_pagamento' AND NEW.status = 'em_preparo' THEN
    IF auth.role() != 'service_role' THEN
      RAISE EXCEPTION 'Transição de aguardando_pagamento para em_preparo só é permitida via verificação de pagamento (webhook/verify-payment).';
    END IF;
    RETURN NEW;
  END IF;

  IF v_old_status = 'aguardando_pagamento' AND NEW.status = 'cancelado' THEN RETURN NEW; END IF;
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

DROP TRIGGER IF EXISTS trg_validate_order_status_transition ON public.orders;
CREATE TRIGGER trg_validate_order_status_transition
BEFORE INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.validate_order_status_transition();

-- 3) Asaas installment + refunded_amount
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS asaas_installment_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_amount numeric;

-- 4) company_settings
CREATE TABLE IF NOT EXISTS public.company_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT ON public.company_settings TO anon, authenticated;
GRANT ALL ON public.company_settings TO service_role;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins e employees leem company_settings" ON public.company_settings;
CREATE POLICY "Admins e employees leem company_settings" ON public.company_settings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

DROP POLICY IF EXISTS "Service role gerencia company_settings" ON public.company_settings;
CREATE POLICY "Service role gerencia company_settings" ON public.company_settings
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS "Leitura pública de company_settings" ON public.company_settings;
CREATE POLICY "Leitura pública de company_settings" ON public.company_settings
  FOR SELECT USING (true);

INSERT INTO public.company_settings (key, value) VALUES
  ('logo_url', ''),
  ('trade_name', 'Japas Pesca'),
  ('legal_name', 'G. SEITI GARCIA BABA LTDA'),
  ('cnpj', '33.169.502/0001-08'),
  ('ie', '13.900.915-9'),
  ('cep', '78556100'),
  ('street', 'Av. das Itaúbas'),
  ('number', '2281'),
  ('complement', ''),
  ('neighborhood', 'Jardim Paraíso'),
  ('city', 'Sinop'),
  ('state', 'MT'),
  ('phone', '(66) 99921-1712'),
  ('whatsapp', '5566999211712'),
  ('email', 'robertobaba2@gmail.com'),
  ('instagram_url', 'https://www.instagram.com/japafishing_/?hl=en')
ON CONFLICT (key) DO NOTHING;