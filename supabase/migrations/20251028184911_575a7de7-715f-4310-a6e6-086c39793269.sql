-- 1. Adicionar constraint de tamanho para mensagens do chat (prevenir XSS e mensagens muito longas)
ALTER TABLE public.chat_messages 
ADD CONSTRAINT chat_messages_message_length CHECK (char_length(message) <= 5000);

-- 2. Criar função para validar transições de status de pedidos
CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status order_status;
BEGIN
  -- Se é uma inserção, permitir
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  v_old_status := OLD.status;

  -- Validar transições permitidas
  -- aguardando_pagamento -> em_preparo (só se pagamento confirmado)
  IF v_old_status = 'aguardando_pagamento' AND NEW.status = 'em_preparo' THEN
    RETURN NEW;
  END IF;

  -- aguardando_pagamento -> cancelado
  IF v_old_status = 'aguardando_pagamento' AND NEW.status = 'cancelado' THEN
    RETURN NEW;
  END IF;

  -- em_preparo -> enviado
  IF v_old_status = 'em_preparo' AND NEW.status = 'enviado' THEN
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

  -- Não permitir mudanças de status final
  IF v_old_status = 'entregado' OR v_old_status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é possível alterar status de pedidos entregues ou cancelados';
  END IF;

  -- Se chegou aqui, transição não é válida
  RAISE EXCEPTION 'Transição de status inválida de % para %', v_old_status, NEW.status;
END;
$$;

-- 3. Criar trigger para validação de status
DROP TRIGGER IF EXISTS validate_order_status_change ON public.orders;
CREATE TRIGGER validate_order_status_change
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.validate_order_status_transition();

-- 4. Criar função para log automático de mudanças de status de pedidos
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Registrar mudança de status se for feita por admin/employee
  IF (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    
    INSERT INTO public.admin_audit_log (
      admin_user_id,
      action,
      table_name,
      record_id,
      accessed_user_id,
      details
    ) VALUES (
      auth.uid(),
      'UPDATE_STATUS',
      'orders',
      NEW.id,
      NEW.user_id,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'order_id', NEW.id,
        'changed_at', now()
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- 5. Criar trigger para log de mudanças de status
DROP TRIGGER IF EXISTS log_order_status_updates ON public.orders;
CREATE TRIGGER log_order_status_updates
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.log_order_status_change();