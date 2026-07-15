ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.webhook_events TO service_role;
DROP POLICY IF EXISTS "service_role only" ON public.webhook_events;
CREATE POLICY "service_role only" ON public.webhook_events FOR ALL TO service_role USING (true) WITH CHECK (true);