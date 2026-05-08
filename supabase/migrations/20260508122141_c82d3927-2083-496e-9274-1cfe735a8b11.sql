CREATE OR REPLACE FUNCTION public.notify_nfe_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text := 'https://qiwcngzbpxddowyqaulm.supabase.co';
  v_key text;
  v_payload jsonb;
BEGIN
  IF NEW.status IN ('error','cancelled')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN

    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'email_queue_service_role_key' LIMIT 1;

    IF v_key IS NULL THEN
      RAISE WARNING 'notify_nfe_status_change: service role key não encontrada no vault';
      RETURN NEW;
    END IF;

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
        'Authorization', 'Bearer ' || v_key
      ),
      body := v_payload
    );
  END IF;

  RETURN NEW;
END;
$$;