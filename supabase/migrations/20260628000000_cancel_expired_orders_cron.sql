-- Agendar cancel-expired-orders a cada 5 minutos
-- Cancela pedidos com PIX expirado (pix_expiration vencido) ou com mais de 24h
-- Requer pg_cron e pg_net (já habilitados em migrações anteriores)

DO $migration$
BEGIN
  -- Remove agendamento anterior se existir (para evitar duplicatas ao reaplicar)
  BEGIN
    PERFORM cron.unschedule('cancel-expired-orders-every-5-min');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cron.unschedule skipped: %', SQLERRM;
  END;

  BEGIN
    PERFORM cron.schedule(
      'cancel-expired-orders-every-5-min',
      '*/5 * * * *', -- A cada 5 minutos
      $cronjob$
      SELECT net.http_post(
        url := 'http://127.0.0.1:54321/functions/v1/cancel-expired-orders',
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
