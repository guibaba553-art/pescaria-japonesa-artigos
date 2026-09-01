CREATE TABLE public.order_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  installments smallint NOT NULL DEFAULT 1 CHECK (installments >= 1 AND installments <= 12),
  cash_received numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_payments_order_id ON public.order_payments(order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_payments TO authenticated;
GRANT ALL ON public.order_payments TO service_role;

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view order payments"
ON public.order_payments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.can_access_pdv(auth.uid()));

CREATE POLICY "Staff can insert order payments"
ON public.order_payments FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.can_access_pdv(auth.uid()));

CREATE POLICY "Staff can update order payments"
ON public.order_payments FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.can_access_pdv(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.can_access_pdv(auth.uid()));

CREATE POLICY "Admins can delete order payments"
ON public.order_payments FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_order_payments_updated_at
BEFORE UPDATE ON public.order_payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();