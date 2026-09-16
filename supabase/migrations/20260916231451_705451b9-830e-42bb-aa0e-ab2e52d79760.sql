ALTER TABLE public.cash_registers
ADD COLUMN IF NOT EXISTS current_denominations jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.cash_registers
SET current_denominations = opening_denominations
WHERE status = 'open'
  AND current_denominations = '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.apply_pdv_cash_exchange(
  p_cash_register_id uuid,
  p_received_denominations jsonb,
  p_change_denominations jsonb,
  p_received_amount numeric,
  p_change_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current jsonb;
  v_result jsonb := '{}'::jsonb;
  v_key text;
  v_value numeric;
  v_received_qty integer;
  v_change_qty integer;
  v_current_qty integer;
  v_received_total numeric := 0;
  v_change_total numeric := 0;
  v_allowed_keys text[] := ARRAY['200','100','50','20','10','5','2','1','0.5','0.25','0.1','0.05'];
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_pdv(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para movimentar o caixa';
  END IF;

  SELECT current_denominations
  INTO v_current
  FROM public.cash_registers
  WHERE id = p_cash_register_id AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa aberto não encontrado';
  END IF;

  IF jsonb_typeof(COALESCE(p_received_denominations, '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(COALESCE(p_change_denominations, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Contagem de cédulas inválida';
  END IF;

  FOREACH v_key IN ARRAY v_allowed_keys LOOP
    v_value := v_key::numeric;
    BEGIN
      v_received_qty := COALESCE((p_received_denominations ->> v_key)::integer, 0);
      v_change_qty := COALESCE((p_change_denominations ->> v_key)::integer, 0);
      v_current_qty := COALESCE((v_current ->> v_key)::integer, 0);
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Quantidade de cédulas inválida';
    END;

    IF v_received_qty < 0 OR v_change_qty < 0 OR v_current_qty < 0 THEN
      RAISE EXCEPTION 'Quantidade de cédulas não pode ser negativa';
    END IF;

    IF v_change_qty > v_current_qty + v_received_qty THEN
      RAISE EXCEPTION 'Cédulas insuficientes para o troco de R$ %', v_key;
    END IF;

    v_received_total := v_received_total + (v_received_qty * v_value);
    v_change_total := v_change_total + (v_change_qty * v_value);

    IF v_current_qty + v_received_qty - v_change_qty > 0 THEN
      v_result := jsonb_set(
        v_result,
        ARRAY[v_key],
        to_jsonb(v_current_qty + v_received_qty - v_change_qty),
        true
      );
    END IF;
  END LOOP;

  IF round(v_received_total, 2) <> round(COALESCE(p_received_amount, 0), 2) THEN
    RAISE EXCEPTION 'O total das cédulas recebidas não confere';
  END IF;

  IF round(v_change_total, 2) <> round(COALESCE(p_change_amount, 0), 2) THEN
    RAISE EXCEPTION 'O total das cédulas do troco não confere';
  END IF;

  UPDATE public.cash_registers
  SET current_denominations = v_result
  WHERE id = p_cash_register_id;

  RETURN jsonb_build_object('current_denominations', v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_pdv_cash_exchange(uuid, jsonb, jsonb, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_pdv_cash_exchange(uuid, jsonb, jsonb, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_pdv_cash_exchange(uuid, jsonb, jsonb, numeric, numeric) TO service_role;