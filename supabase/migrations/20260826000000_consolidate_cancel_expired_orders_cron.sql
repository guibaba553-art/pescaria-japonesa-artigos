-- Consolida o cron cancel-expired-orders em um único job funcional.
-- Remove os dois jobs existentes em produção:
--   - cancel-expired-orders-hourly (URL correta, mas Bearer token ≠ CRON_SECRET → 401)
--   - cancel-expired-orders-every-5-min (URL local 127.0.0.1:54321 → nunca executa)
-- Recria cancel-expired-orders-every-5-min com URL e secret lidos do vault
-- (functions_base_url + cron_secret). Em produção, atualizar functions_base_url
-- para a URL real do projeto (ver spec, seção "Ação manual na PRD").

DO $migration$
BEGIN
  BEGIN
    PERFORM cron.unschedule('cancel-expired-orders-hourly');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cron.unschedule (hourly) skipped: %', SQLERRM;
  END;

  BEGIN
    PERFORM cron.unschedule('cancel-expired-orders-every-5-min');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cron.unschedule (every-5-min) skipped: %', SQLERRM;
  END;
END $migration$;

-- Seed idempotente de functions_base_url (não sobrescreve valor existente)
DO $$
DECLARE v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'functions_base_url';
  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(
      coalesce(current_setting('app.functions_base_url', true), 'http://127.0.0.1:54321'),
      'functions_base_url',
      'URL base do projeto usada por jobs pg_cron para chamar edge functions'
    );
  END IF;
END$$;

DO $migration$
BEGIN
  BEGIN
    PERFORM cron.schedule(
      'cancel-expired-orders-every-5-min',
      '*/5 * * * *',
      $cronjob$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'functions_base_url' LIMIT 1) || '/functions/v1/cancel-expired-orders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
        ),
        body := '{}'::jsonb
      );
      $cronjob$
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cron.schedule skipped: %', SQLERRM;
  END;
END $migration$;
