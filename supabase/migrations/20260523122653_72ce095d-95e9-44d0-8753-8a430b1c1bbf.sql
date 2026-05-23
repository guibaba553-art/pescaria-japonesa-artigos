CREATE OR REPLACE FUNCTION public.auto_link_order_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Só faz auto-link para pedidos do SITE.
  -- Em vendas do PDV, user_id é o operador (funcionário), não o comprador.
  -- Atrelar o operador como cliente faria NFC-e anônima sair no CPF dele.
  IF NEW.source = 'pdv' THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NULL AND NEW.user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.customers WHERE id = NEW.user_id) THEN
      NEW.customer_id := NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;