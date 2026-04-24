-- Add 'retirado' status to order_status enum
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'retirado';

-- Update transition validation function to allow em_preparo -> retirado
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

  -- aguardando_pagamento -> em_preparo
  IF v_old_status = 'aguardando_pagamento' AND NEW.status = 'em_preparo' THEN
    RETURN NEW;
  END IF;

  -- aguardando_pagamento -> cancelado
  IF v_old_status = 'aguardando_pagamento' AND NEW.status = 'cancelado' THEN
    RETURN NEW;
  END IF;

  -- em_preparo -> enviado (delivery)
  IF v_old_status = 'em_preparo' AND NEW.status = 'enviado' THEN
    RETURN NEW;
  END IF;

  -- em_preparo -> retirado (pickup direto na loja)
  IF v_old_status = 'em_preparo' AND NEW.status = 'retirado' THEN
    RETURN NEW;
  END IF;

  -- em_preparo -> cancelado
  IF v_old_status = 'em_preparo' AND NEW.status = 'cancelado' THEN
    RETURN NEW;
  END IF;

  -- enviado -> entregado
  IF v_old_status = 'enviado' AND NEW.status = 'entregado' THEN
    RETURN NEW;
  END IF;

  -- Status finais
  IF v_old_status = 'entregado' OR v_old_status = 'cancelado' OR v_old_status = 'retirado' THEN
    RAISE EXCEPTION 'Não é possível alterar status de pedidos finalizados';
  END IF;

  RAISE EXCEPTION 'Transição de status inválida de % para %', v_old_status, NEW.status;
END;
$function$;