-- Allow retirado -> devolvido direct transition (pickup return in one step)
CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_status order_status;
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  v_old_status := OLD.status;

  IF v_old_status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF v_old_status = 'aguardando_pagamento' AND NEW.status IN ('em_preparo', 'cancelado') THEN
    RETURN NEW;
  END IF;

  -- From em_preparo: can go to aguardando_envio (via triagem), pronto_retirada (pickup ready), retirado (legacy), or cancelado
  IF v_old_status = 'em_preparo' AND NEW.status IN ('aguardando_envio', 'pronto_retirada', 'retirado', 'cancelado') THEN
    RETURN NEW;
  END IF;

  -- From pronto_retirada: customer picks it up → retirado, or cancelado
  IF v_old_status = 'pronto_retirada' AND NEW.status IN ('retirado', 'cancelado') THEN
    RETURN NEW;
  END IF;

  IF v_old_status = 'aguardando_envio' AND NEW.status IN ('enviado', 'em_preparo', 'cancelado') THEN
    RETURN NEW;
  END IF;

  IF v_old_status = 'enviado' AND NEW.status IN ('entregado', 'cancelado') THEN
    RETURN NEW;
  END IF;

  -- Permitir cancelar pedidos entregues/retirados (ex.: vendas duplicadas no PDV)
  IF v_old_status IN ('entregado', 'retirado') AND NEW.status = 'cancelado' THEN
    RETURN NEW;
  END IF;

  IF v_old_status IN ('entregado', 'retirado') AND NEW.status = 'devolucao_solicitada' THEN
    RETURN NEW;
  END IF;

  IF v_old_status = 'devolucao_solicitada' AND NEW.status = 'devolvido' THEN
    RETURN NEW;
  END IF;

  -- retirado -> devolvido (devolução direta para retirada na loja, sem passar por devolucao_solicitada)
  IF v_old_status = 'retirado' AND NEW.status = 'devolvido' THEN
    RETURN NEW;
  END IF;

  IF v_old_status = 'devolucao_solicitada' AND NEW.status IN ('entregado', 'retirado') THEN
    RETURN NEW;
  END IF;

  IF v_old_status IN ('devolvido', 'cancelado') THEN
    RAISE EXCEPTION 'Não é possível alterar status de pedidos finalizados';
  END IF;

  RAISE EXCEPTION 'Transição de status inválida de % para %', v_old_status, NEW.status;
END;
$$;
