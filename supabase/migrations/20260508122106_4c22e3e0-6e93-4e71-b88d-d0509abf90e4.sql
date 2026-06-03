-- Garantir extensão pg_net
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_nfe_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
  v_secret text;
  v_payload jsonb;
BEGIN
  -- Só dispara em transição PARA error/cancelled
  IF NEW.status IN ('error','cancelled')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN

    SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
    IF v_url IS NULL THEN
      v_url := 'http://127.0.0.1:54321';
    END IF;

    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;

    v_payload := jsonb_build_object(
      'emission_id', NEW.id,
      'modelo', NEW.modelo,
      'numero', NEW.nfe_number,
      'status', NEW.status,
      'error_message', NEW.error_message,
      'emitted_at', COALESCE(NEW.emitted_at, NEW.created_at),
      'order_id', NEW.order_id
    );

    PERFORM extensions.http_post(
      url := v_url || '/functions/v1/notify-nfe-status-change',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', COALESCE(v_secret, '')
      ),
      body := v_payload
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_nfe_status_change ON public.nfe_emissions;
CREATE TRIGGER trg_notify_nfe_status_change
AFTER INSERT OR UPDATE OF status ON public.nfe_emissions
FOR EACH ROW
EXECUTE FUNCTION public.notify_nfe_status_change();

-- Salvar CRON_SECRET no vault para o trigger autenticar com a edge function
DO $$
DECLARE v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'cron_secret';
  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(
      coalesce(current_setting('app.cron_secret', true), encode(gen_random_bytes(24), 'hex')),
      'cron_secret',
      'Secret usado pelos triggers para chamar edge functions'
    );
  END IF;
END$$;