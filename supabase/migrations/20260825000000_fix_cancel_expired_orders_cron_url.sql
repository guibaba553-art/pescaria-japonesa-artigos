-- Corrige a URL do cron cancel-expired-orders: a migração 20260628000000 gravou
-- http://127.0.0.1:54321 (URL local), portanto o job nunca executa em produção.
-- Passa a ler functions_base_url do vault (seed idempotente abaixo).

DO $migration$
BEGIN
  BEGIN
    PERFORM cron.unschedule('cancel-expired-orders-every-5-min');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cron.unschedule skipped: %', SQLERRM;
  END;
END $migration$;

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
