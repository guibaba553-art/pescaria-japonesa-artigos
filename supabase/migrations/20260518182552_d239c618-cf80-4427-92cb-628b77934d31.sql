DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'database-backup-every-3-days';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'database-backup-every-3-days',
  '0 3 */3 * *',
  $$
  SELECT net.http_post(
    url := 'https://qiwcngzbpxddowyqaulm.supabase.co/functions/v1/database-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);