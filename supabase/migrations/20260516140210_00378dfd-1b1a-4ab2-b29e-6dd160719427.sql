-- 1) Coluna para guardar o valor recebido em dinheiro
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cash_received numeric;

-- 2) Função que registra troco automaticamente
CREATE OR REPLACE FUNCTION public.auto_register_troco_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_register_id uuid;
  v_troco numeric;
BEGIN
  -- Apenas vendas do PDV em dinheiro com valor recebido informado
  IF NEW.source = 'pdv'
     AND NEW.payment_method = 'cash'
     AND NEW.cash_received IS NOT NULL
     AND NEW.cash_received > NEW.total_amount THEN

    v_troco := ROUND((NEW.cash_received - NEW.total_amount)::numeric, 2);

    IF v_troco > 0 THEN
      -- Pega o caixa aberto mais recente
      SELECT id INTO v_register_id
      FROM public.cash_registers
      WHERE status = 'open'
      ORDER BY opened_at DESC
      LIMIT 1;

      IF v_register_id IS NOT NULL THEN
        INSERT INTO public.cash_movements (cash_register_id, type, amount, reason, performed_by)
        VALUES (
          v_register_id,
          'withdrawal',
          v_troco,
          'Troco - pedido ' || substring(NEW.id::text, 1, 8),
          NEW.user_id
        );

        UPDATE public.cash_registers
        SET withdrawals = withdrawals + v_troco,
            expected_amount = expected_amount - v_troco
        WHERE id = v_register_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Trigger no INSERT de orders
DROP TRIGGER IF EXISTS trg_auto_register_troco ON public.orders;
CREATE TRIGGER trg_auto_register_troco
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_register_troco_on_order();