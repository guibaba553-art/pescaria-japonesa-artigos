
CREATE OR REPLACE FUNCTION public.auto_register_troco_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_register_id uuid;
  v_troco numeric;
BEGIN
  IF NEW.source = 'pdv'
     AND lower(coalesce(NEW.payment_method,'')) IN ('cash','dinheiro')
     AND NEW.cash_received IS NOT NULL
     AND NEW.cash_received > NEW.total_amount THEN

    v_troco := NEW.cash_received - NEW.total_amount;

    SELECT id INTO v_register_id
    FROM public.cash_registers
    WHERE status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;

    IF v_register_id IS NOT NULL AND v_troco > 0 THEN
      INSERT INTO public.cash_movements (
        cash_register_id, type, amount, reason, performed_by
      ) VALUES (
        v_register_id, 'withdrawal', v_troco,
        'Troco - pedido ' || substring(NEW.id::text, 1, 8),
        NEW.user_id
      );

      -- Troco sai do caixa: abate só do esperado, NÃO conta como sangria
      UPDATE public.cash_registers
      SET expected_amount = expected_amount - v_troco
      WHERE id = v_register_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_register_troco ON public.orders;
CREATE TRIGGER trg_auto_register_troco
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_register_troco_on_order();
