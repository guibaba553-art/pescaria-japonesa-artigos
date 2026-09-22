ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS account TEXT NOT NULL DEFAULT 'stone';

CREATE TABLE IF NOT EXISTS public.account_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account TEXT NOT NULL UNIQUE,
  opening_amount NUMERIC NOT NULL DEFAULT 0,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_balances TO authenticated;
GRANT ALL ON public.account_balances TO service_role;

ALTER TABLE public.account_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view account balances"
ON public.account_balances FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'));

CREATE POLICY "Staff can insert account balances"
ON public.account_balances FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'));

CREATE POLICY "Staff can update account balances"
ON public.account_balances FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'));

CREATE POLICY "Admins can delete account balances"
ON public.account_balances FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER account_balances_set_updated_at
BEFORE UPDATE ON public.account_balances
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();