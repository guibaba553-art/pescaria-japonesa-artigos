-- Create rate limiting table for fiscal edge functions
CREATE TABLE IF NOT EXISTS public.fiscal_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  function_name TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, function_name, window_start)
);

-- Enable RLS
ALTER TABLE public.fiscal_rate_limits ENABLE ROW LEVEL SECURITY;

-- Users can view their own rate limits
CREATE POLICY "Users can view their own rate limits"
ON public.fiscal_rate_limits
FOR SELECT
USING (auth.uid() = user_id);

-- Service role can manage rate limits (for edge functions)
CREATE POLICY "Service role can manage rate limits"
ON public.fiscal_rate_limits
FOR ALL
USING (auth.role() = 'service_role');

-- Index for faster lookups
CREATE INDEX idx_fiscal_rate_limits_user_function 
ON public.fiscal_rate_limits(user_id, function_name, window_start);

-- Function to check and update rate limits
CREATE OR REPLACE FUNCTION public.check_fiscal_rate_limit(
  p_user_id UUID,
  p_function_name TEXT,
  p_max_requests INTEGER,
  p_window_hours INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start := date_trunc('hour', now() - (p_window_hours || ' hours')::interval);
  
  -- Get current count for this window
  SELECT COALESCE(SUM(request_count), 0)
  INTO v_current_count
  FROM public.fiscal_rate_limits
  WHERE user_id = p_user_id
    AND function_name = p_function_name
    AND window_start >= v_window_start;
  
  -- Check if limit exceeded
  IF v_current_count >= p_max_requests THEN
    RETURN FALSE;
  END IF;
  
  -- Increment counter
  INSERT INTO public.fiscal_rate_limits (user_id, function_name, request_count, window_start)
  VALUES (p_user_id, p_function_name, 1, date_trunc('hour', now()))
  ON CONFLICT (user_id, function_name, window_start)
  DO UPDATE SET 
    request_count = fiscal_rate_limits.request_count + 1,
    updated_at = now();
  
  RETURN TRUE;
END;
$$;