ALTER TABLE public.cash_movements ADD COLUMN IF NOT EXISTS denominations jsonb;
CREATE OR REPLACE FUNCTION public.register_cash_reinforcement(p_cash_register_id uuid, p_denominations jsonb, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_register public.cash_registers%ROWTYPE;
  v_counts jsonb;
  v_clean jsonb := '{}'::jsonb;
  v_key text;
  v_raw jsonb;
  v_qty integer;
  v_amount numeric := 0;
  v_movement uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'admin') OR (public.has_role(auth.uid(), 'employee') AND EXISTS (SELECT 1 FROM public.employee_permissions WHERE user_id = auth.uid() AND can_access_cash_register))) THEN
    RAISE EXCEPTION 'Sem permissão para movimentar o caixa';
  END IF;
  IF p_denominations IS NULL OR jsonb_typeof(p_denominations) <> 'object' THEN
    RAISE EXCEPTION 'Contagem de cédulas inválida';
  END IF;
  SELECT * INTO v_register FROM public.cash_registers WHERE id = p_cash_register_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caixa aberto não encontrado'; END IF;
  v_counts := COALESCE(v_register.current_denominations, v_register.opening_denominations, '{}'::jsonb);
  FOR v_key, v_raw IN SELECT key, value FROM jsonb_each(p_denominations) LOOP
    IF NOT (v_key = ANY(ARRAY['200','100','50','20','10','5','2','1','0.5','0.25','0.1','0.05'])) OR jsonb_typeof(v_raw) <> 'number' OR (v_raw #>> '{}')::numeric < 0 OR (v_raw #>> '{}')::numeric <> trunc((v_raw #>> '{}')::numeric) THEN
      RAISE EXCEPTION 'Quantidade de cédulas inválida';
    END IF;
    v_qty := (v_raw #>> '{}')::integer;
    IF v_qty > 0 THEN
      v_amount := v_amount + v_key::numeric * v_qty;
      v_clean := jsonb_set(v_clean, ARRAY[v_key], to_jsonb(v_qty));
      v_counts := jsonb_set(v_counts, ARRAY[v_key], to_jsonb(COALESCE((v_counts ->> v_key)::integer, 0) + v_qty));
    END IF;
  END LOOP;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Informe as cédulas e moedas do reforço'; END IF;
  INSERT INTO public.cash_movements(cash_register_id, type, amount, reason, performed_by, denominations)
  VALUES(p_cash_register_id, 'addition', v_amount, p_reason, auth.uid(), v_clean) RETURNING id INTO v_movement;
  UPDATE public.cash_registers SET current_denominations = v_counts,
    additions = (SELECT COALESCE(sum(amount), 0) FROM public.cash_movements WHERE cash_register_id = p_cash_register_id AND type = 'addition'),
    expected_amount = COALESCE(expected_amount, opening_amount, 0) + v_amount
  WHERE id = p_cash_register_id;
  RETURN jsonb_build_object('movement_id', v_movement, 'amount', v_amount, 'current_denominations', v_counts);
END;
$$;
REVOKE ALL ON FUNCTION public.register_cash_reinforcement(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_cash_reinforcement(uuid, jsonb, text) TO authenticated;