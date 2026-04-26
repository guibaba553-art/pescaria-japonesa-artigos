-- Tabela para salvar formas de pagamento preferidas do cliente
-- IMPORTANTE: Apenas dados NÃO-SENSÍVEIS. Nunca o número completo nem o CVV.
CREATE TABLE public.saved_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('pix','credit_card','debit_card','boleto')),
  -- Campos opcionais, só usados quando payment_method é cartão
  card_brand TEXT,
  card_last4 TEXT CHECK (card_last4 IS NULL OR card_last4 ~ '^\d{4}$'),
  cardholder_name TEXT,
  card_exp_month TEXT CHECK (card_exp_month IS NULL OR card_exp_month ~ '^(0[1-9]|1[0-2])$'),
  card_exp_year TEXT CHECK (card_exp_year IS NULL OR card_exp_year ~ '^\d{2}$'),
  is_default BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_payment_methods_user ON public.saved_payment_methods(user_id, last_used_at DESC);

ALTER TABLE public.saved_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem suas formas de pagamento salvas"
ON public.saved_payment_methods FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Usuários criam suas formas de pagamento salvas"
ON public.saved_payment_methods FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários atualizam suas formas de pagamento salvas"
ON public.saved_payment_methods FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários deletam suas formas de pagamento salvas"
ON public.saved_payment_methods FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Trigger para garantir um único default por usuário
CREATE OR REPLACE FUNCTION public.ensure_single_default_payment_method()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.saved_payment_methods
       SET is_default = false
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_single_default_payment_method
BEFORE INSERT OR UPDATE ON public.saved_payment_methods
FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_payment_method();

-- Trigger updated_at
CREATE TRIGGER trg_saved_payment_methods_updated_at
BEFORE UPDATE ON public.saved_payment_methods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();