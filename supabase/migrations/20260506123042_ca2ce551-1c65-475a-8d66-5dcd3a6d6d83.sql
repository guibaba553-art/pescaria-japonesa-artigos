
CREATE TABLE public.tef_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled BOOLEAN NOT NULL DEFAULT false,
  mode TEXT NOT NULL DEFAULT 'connect' CHECK (mode IN ('connect', 'api')),
  stone_code TEXT,
  agent_url TEXT DEFAULT 'http://localhost:9999',
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
  auto_print_receipt BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tef_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tef_settings" ON public.tef_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Employees read tef_settings" ON public.tef_settings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'employee'::app_role));

CREATE TRIGGER tef_settings_updated_at
  BEFORE UPDATE ON public.tef_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.tef_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  installments INTEGER NOT NULL DEFAULT 1,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('credit', 'debit', 'pix', 'voucher')),
  card_brand TEXT,
  card_last_digits TEXT,
  nsu TEXT,
  authorization_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled', 'error')),
  error_message TEXT,
  raw_response JSONB,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tef_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read tef_transactions" ON public.tef_transactions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Staff insert tef_transactions" ON public.tef_transactions
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Staff update tef_transactions" ON public.tef_transactions
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE TRIGGER tef_transactions_updated_at
  BEFORE UPDATE ON public.tef_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_tef_transactions_order ON public.tef_transactions(order_id);
CREATE INDEX idx_tef_transactions_status ON public.tef_transactions(status);
CREATE INDEX idx_tef_transactions_created ON public.tef_transactions(created_at DESC);
