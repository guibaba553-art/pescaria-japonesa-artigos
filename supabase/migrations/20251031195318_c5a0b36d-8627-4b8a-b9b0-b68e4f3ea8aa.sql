-- Create rate limiting table for payment requests
CREATE TABLE IF NOT EXISTS public.payment_rate_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  window_start timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on rate limits table
ALTER TABLE public.payment_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only the system can manage rate limits
CREATE POLICY "System manages rate limits"
ON public.payment_rate_limits
FOR ALL
USING (false)
WITH CHECK (false);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_rate_limits_user_window 
ON public.payment_rate_limits(user_id, window_start DESC);

-- Add trigger to update updated_at
CREATE TRIGGER update_payment_rate_limits_updated_at
BEFORE UPDATE ON public.payment_rate_limits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();