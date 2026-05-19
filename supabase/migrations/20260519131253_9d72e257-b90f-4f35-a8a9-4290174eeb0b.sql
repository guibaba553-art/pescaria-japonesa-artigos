CREATE TABLE IF NOT EXISTS public.error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  user_email TEXT,
  message TEXT NOT NULL,
  stack TEXT,
  source TEXT,
  url TEXT,
  user_agent TEXT,
  severity TEXT NOT NULL DEFAULT 'error',
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON public.error_logs (created_at DESC);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert error logs"
ON public.error_logs FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admins can view error logs"
ON public.error_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete error logs"
ON public.error_logs FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));