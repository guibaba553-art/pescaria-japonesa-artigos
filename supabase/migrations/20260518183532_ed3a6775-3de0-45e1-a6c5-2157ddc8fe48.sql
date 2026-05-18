DO $$
DECLARE v_key text; v_req bigint;
BEGIN
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='cron_secret' LIMIT 1;
  SELECT net.http_post(
    url := 'https://qiwcngzbpxddowyqaulm.supabase.co/functions/v1/database-backup',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', v_key),
    body := '{}'::jsonb
  ) INTO v_req;
  RAISE NOTICE 'request_id=%', v_req;
END $$;