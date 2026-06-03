DO $migration$
BEGIN
  BEGIN
    PERFORM cron.unschedule('database-backup-every-3-days');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cron.unschedule skipped: %', SQLERRM;
  END;
  BEGIN
    PERFORM cron.schedule(
      'database-backup-every-3-days',
      '0 3 */3 * *',
      $cronjob$
      SELECT net.http_post(
        url := 'http://127.0.0.1:54321/functions/v1/database-backup',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
        ),
        body := '{}'::jsonb
      );
      $cronjob$
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cron.schedule skipped: %', SQLERRM;
  END;
END $migration$;
