-- Recriar o agendamento de verificação de NF-e usando o cron_secret do vault
SELECT cron.unschedule('check-nfe-status-every-minute');

SELECT cron.schedule(
  'check-nfe-status-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qiwcngzbpxddowyqaulm.supabase.co/functions/v1/check-nfe-status',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);