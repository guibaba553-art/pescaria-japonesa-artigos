CREATE TABLE IF NOT EXISTS public.site_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL,
  referrer text,
  user_agent text,
  session_id text,
  user_id uuid,
  device_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_visits_created_at ON public.site_visits (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_visits_path ON public.site_visits (path);
CREATE INDEX IF NOT EXISTS idx_site_visits_session ON public.site_visits (session_id, created_at);

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous visitors) can register a visit
CREATE POLICY "Qualquer um pode registrar visita"
  ON public.site_visits
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read analytics
CREATE POLICY "Admins veem visitas"
  ON public.site_visits
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));