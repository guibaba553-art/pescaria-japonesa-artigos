-- 2) Atualizar validação de transição de status para suportar fluxo de devolução
CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_status order_status;
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  v_old_status := OLD.status;

  -- Sem mudança? passa direto
  IF v_old_status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- aguardando_pagamento -> em_preparo | cancelado
  IF v_old_status = 'aguardando_pagamento' AND NEW.status IN ('em_preparo', 'cancelado') THEN
    RETURN NEW;
  END IF;

  -- em_preparo -> enviado | retirado | cancelado
  IF v_old_status = 'em_preparo' AND NEW.status IN ('enviado', 'retirado', 'cancelado') THEN
    RETURN NEW;
  END IF;

  -- enviado -> entregado
  IF v_old_status = 'enviado' AND NEW.status = 'entregado' THEN
    RETURN NEW;
  END IF;

  -- entregado/retirado -> devolucao_solicitada (cliente pede devolução)
  IF v_old_status IN ('entregado', 'retirado') AND NEW.status = 'devolucao_solicitada' THEN
    RETURN NEW;
  END IF;

  -- devolucao_solicitada -> devolvido (produto voltou para a loja)
  IF v_old_status = 'devolucao_solicitada' AND NEW.status = 'devolvido' THEN
    RETURN NEW;
  END IF;

  -- devolucao_solicitada -> entregado/retirado (cancelar a solicitação)
  IF v_old_status = 'devolucao_solicitada' AND NEW.status IN ('entregado', 'retirado') THEN
    RETURN NEW;
  END IF;

  -- Status finais: devolvido / cancelado não podem ser alterados
  IF v_old_status IN ('devolvido', 'cancelado') THEN
    RAISE EXCEPTION 'Não é possível alterar status de pedidos finalizados';
  END IF;

  RAISE EXCEPTION 'Transição de status inválida de % para %', v_old_status, NEW.status;
END;
$function$;

-- 3) Trigger: reverter estoque automaticamente ao marcar como devolvido
CREATE OR REPLACE FUNCTION public.auto_revert_stock_on_devolvido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_movement RECORD;
BEGIN
  -- Só age quando o status muda PARA devolvido
  IF NEW.status = 'devolvido' AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Para cada movimentação de venda do pedido, criar a contrapartida (entrada de estoque)
    FOR v_movement IN
      SELECT product_id, variation_id, quantity_delta
      FROM public.stock_movements
      WHERE order_id = NEW.id AND movement_type IN ('sale', 'pdv_sale')
    LOOP
      PERFORM public.apply_stock_movement(
        v_movement.product_id,
        v_movement.variation_id,
        -v_movement.quantity_delta, -- inverte o sinal: devolve ao estoque
        'return',
        NEW.id,
        'Devolução confirmada do pedido ' || NEW.id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_revert_stock_on_devolvido ON public.orders;
CREATE TRIGGER trg_auto_revert_stock_on_devolvido
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_revert_stock_on_devolvido();

-- Garantir que o trigger de validação de transição esteja ativo
DROP TRIGGER IF EXISTS trg_validate_order_status_transition ON public.orders;
CREATE TRIGGER trg_validate_order_status_transition
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_order_status_transition();