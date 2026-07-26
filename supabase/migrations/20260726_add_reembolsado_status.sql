-- Adiciona o status 'reembolsado' como estado final nas transições de pedido.
-- Pedidos reembolsados não podem transitar para nenhum outro status.

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'reembolsado';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_amount numeric;

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
      SELECT COUNT(*) INTO v_pending_count
      FROM public.orders
      WHERE user_id = NEW.user_id AND status = 'aguardando_pagamento';
      IF v_pending_count >= 3 THEN
        RAISE EXCEPTION 'Limite de 3 pedidos pendentes atingido. Cancele pedidos anteriores ou aguarde o pagamento.';
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.orders
        WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '15 seconds'
      ) THEN
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
  IF v_old_status = 'em_preparo' AND NEW.status IN ('aguardando_envio','pronto_retirada','retirado','cancelado','reembolsado') THEN RETURN NEW; END IF;
  IF v_old_status = 'pronto_retirada' AND NEW.status IN ('retirado','cancelado','reembolsado') THEN RETURN NEW; END IF;
  IF v_old_status = 'aguardando_envio' AND NEW.status IN ('enviado','em_preparo','cancelado','reembolsado') THEN RETURN NEW; END IF;
  IF v_old_status = 'enviado' AND NEW.status IN ('entregado','cancelado','reembolsado') THEN RETURN NEW; END IF;
  IF v_old_status IN ('entregado','retirado') AND NEW.status = 'cancelado' THEN RETURN NEW; END IF;
  IF v_old_status IN ('entregado','retirado') AND NEW.status = 'devolucao_solicitada' THEN RETURN NEW; END IF;
  IF v_old_status IN ('entregado','retirado') AND NEW.status = 'reembolsado' THEN RETURN NEW; END IF;
  IF v_old_status = 'devolucao_solicitada' AND NEW.status = 'devolvido' THEN RETURN NEW; END IF;
  IF v_old_status = 'retirado' AND NEW.status = 'devolvido' THEN RETURN NEW; END IF;
  IF v_old_status = 'devolucao_solicitada' AND NEW.status IN ('entregado','retirado') THEN RETURN NEW; END IF;
  IF v_old_status IN ('devolvido','cancelado','reembolsado') THEN
    RAISE EXCEPTION 'Não é possível alterar status de pedidos finalizados';
  END IF;
  RAISE EXCEPTION 'Transição de status inválida de % para %', v_old_status, NEW.status;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_order_status_transition ON public.orders;
CREATE TRIGGER trg_validate_order_status_transition
BEFORE INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_order_status_transition();
