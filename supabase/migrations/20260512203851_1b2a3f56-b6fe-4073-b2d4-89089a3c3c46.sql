DO $migration$
BEGIN
  BEGIN
    PERFORM cron.unschedule('check-nfe-status-every-minute');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cron.unschedule skipped: %', SQLERRM;
  END;
  BEGIN
    PERFORM cron.schedule(
      'check-nfe-status-every-minute',
      '* * * * *',
      $cronjob$
      SELECT net.http_post(
        url := 'http://127.0.0.1:54321/functions/v1/check-nfe-status',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
        ),
        body := '{}'::jsonb
      );
      $cronjob$
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cron.schedule skipped: %', SQLERRM;
  END;
END $migration$;
