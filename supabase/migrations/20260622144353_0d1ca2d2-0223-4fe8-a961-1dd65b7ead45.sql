
-- Trigger AFTER INSERT em orders que dispara a emissão fiscal para vendas
-- do PDV pagas em pix/credit/debit, via pg_net → edge function auto-emit-fiscal.
-- Roda no servidor, independente do navegador do operador.

CREATE OR REPLACE FUNCTION public.trg_auto_emit_fiscal_on_pdv_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions, vault
AS $$
DECLARE
  v_url text := 'https://qiwcngzbpxddowyqaulm.supabase.co';
  v_key text;
BEGIN
  -- Apenas vendas do PDV em pix/credit/debit acionam a auto-emissão
  IF NEW.source IS DISTINCT FROM 'pdv' THEN
    RETURN NEW;
  END IF;

  IF lower(coalesce(NEW.payment_method, '')) NOT IN ('pix', 'credit', 'debit') THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'email_queue_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;

  IF v_key IS NULL THEN
    RAISE WARNING 'trg_auto_emit_fiscal_on_pdv_order: service role key não encontrada no vault';
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/auto-emit-fiscal',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object('order_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_auto_emit_fiscal_on_pdv_order: falha ao chamar auto-emit-fiscal: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_emit_fiscal_on_pdv_order ON public.orders;

CREATE TRIGGER auto_emit_fiscal_on_pdv_order
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_auto_emit_fiscal_on_pdv_order();
