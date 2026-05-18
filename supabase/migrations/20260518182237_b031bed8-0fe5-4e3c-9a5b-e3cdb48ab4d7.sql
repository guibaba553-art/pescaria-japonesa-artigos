-- Bucket privado para armazenar os dumps
INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

-- Apenas admins podem ler os arquivos do bucket (links assinados continuam funcionando para qualquer um com o link)
DROP POLICY IF EXISTS "Admins podem ver backups" ON storage.objects;
CREATE POLICY "Admins podem ver backups"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'));

-- Garante extensões para agendamento HTTP
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamento anterior se existir
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'database-backup-every-3-days';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

-- Agendamento a cada 3 dias às 03:00 (horário do servidor)
SELECT cron.schedule(
  'database-backup-every-3-days',
  '0 3 */3 * *',
  $$
  SELECT net.http_post(
    url := 'https://qiwcngzbpxddowyqaulm.supabase.co/functions/v1/database-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);