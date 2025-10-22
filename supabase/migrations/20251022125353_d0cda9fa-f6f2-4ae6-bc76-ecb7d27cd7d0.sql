-- Habilitar extensões necessárias para cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Agendar limpeza de mensagens antigas a cada hora
SELECT cron.schedule(
  'cleanup-old-chat-messages',
  '0 * * * *', -- A cada hora
  $$
  SELECT
    net.http_post(
        url:='https://qiwcngzbpxddowyqaulm.supabase.co/functions/v1/cleanup-old-messages',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpd2NuZ3picHhkZG93eXFhdWxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwNzAzMTEsImV4cCI6MjA3NjY0NjMxMX0.YF1a7IkhgFXbWpHaf3YffEUsDY8yUkyidKEt0H0eZgM"}'::jsonb
    ) as request_id;
  $$
);