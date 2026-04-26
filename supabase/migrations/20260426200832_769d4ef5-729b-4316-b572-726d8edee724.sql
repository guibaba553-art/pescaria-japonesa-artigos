CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL,
  payment_id TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  mp_refund_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  error_message TEXT,
  performed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_order_id ON public.payment_refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment_id ON public.payment_refunds(payment_id);

ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e employees veem estornos"
  ON public.payment_refunds FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Service role gerencia estornos"
  ON public.payment_refunds FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');