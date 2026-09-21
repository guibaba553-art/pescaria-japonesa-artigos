-- 1) Auto-emissão fiscal do PDV passa a ser disparada no fim da transação,
--    quando os itens da venda já estão gravados.
DROP TRIGGER IF EXISTS auto_emit_fiscal_on_pdv_order ON public.orders;
CREATE CONSTRAINT TRIGGER auto_emit_fiscal_on_pdv_order
  AFTER INSERT ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_auto_emit_fiscal_on_pdv_order();

-- 2) Gravação atômica da venda do PDV
CREATE OR REPLACE FUNCTION public.create_pdv_sale(
  p_order jsonb,
  p_items jsonb,
  p_payments jsonb DEFAULT '[]'::jsonb,
  p_cash_exchange jsonb DEFAULT NULL,
  p_promo_items jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_key text := p_order->>'idempotency_key';
  v_order_id uuid;
  v_existing public.orders;
  v_item_count int;
  v_item jsonb;
  v_reused boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'employee')) THEN
    RAISE EXCEPTION 'Sem permissão para registrar vendas';
  END IF;
  IF v_key IS NULL OR length(v_key) = 0 THEN
    RAISE EXCEPTION 'idempotency_key obrigatória';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Venda sem produtos';
  END IF;

  SELECT * INTO v_existing FROM public.orders WHERE idempotency_key = v_key LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    SELECT count(*) INTO v_item_count FROM public.order_items WHERE order_id = v_existing.id;
    IF v_item_count > 0 THEN
      RETURN jsonb_build_object(
        'order_id', v_existing.id,
        'already_registered', true,
        'completed', true
      );
    END IF;
    -- Pedido de uma tentativa anterior que ficou sem produtos: completa agora.
    v_order_id := v_existing.id;
    v_reused := true;
    DELETE FROM public.order_payments WHERE order_id = v_order_id;
  ELSE
    INSERT INTO public.orders (
      user_id, total_amount, shipping_cost, status, delivery_type,
      shipping_address, shipping_cep, customer_id, source,
      payment_method, installments, idempotency_key,
      tef_transaction_id, card_brand, card_last_digits, nsu, authorization_code,
      notes, cash_received, pdv_service_time_seconds
    ) VALUES (
      (p_order->>'user_id')::uuid,
      (p_order->>'total_amount')::numeric,
      COALESCE((p_order->>'shipping_cost')::numeric, 0),
      COALESCE((p_order->>'status')::public.order_status, 'entregado'::public.order_status),
      COALESCE(p_order->>'delivery_type', 'pickup'),
      p_order->>'shipping_address',
      p_order->>'shipping_cep',
      NULLIF(p_order->>'customer_id', '')::uuid,
      COALESCE(p_order->>'source', 'pdv'),
      p_order->>'payment_method',
      COALESCE((p_order->>'installments')::int, 1),
      v_key,
      NULLIF(p_order->>'tef_transaction_id', '')::uuid,
      p_order->>'card_brand',
      p_order->>'card_last_digits',
      p_order->>'nsu',
      p_order->>'authorization_code',
      p_order->>'notes',
      NULLIF(p_order->>'cash_received', '')::numeric,
      NULLIF(p_order->>'pdv_service_time_seconds', '')::int
    )
    RETURNING id INTO v_order_id;
  END IF;

  -- Produtos da venda
  INSERT INTO public.order_items (order_id, product_id, variation_id, quantity, price_at_purchase)
  SELECT
    v_order_id,
    (it->>'product_id')::uuid,
    NULLIF(it->>'variation_id', '')::uuid,
    (it->>'quantity')::numeric,
    (it->>'price_at_purchase')::numeric
  FROM jsonb_array_elements(p_items) AS it;

  -- Formas de pagamento (rateio)
  IF p_payments IS NOT NULL AND jsonb_array_length(p_payments) > 0 THEN
    INSERT INTO public.order_payments (order_id, payment_method, amount, installments, cash_received)
    SELECT
      v_order_id,
      pay->>'payment_method',
      (pay->>'amount')::numeric,
      COALESCE((pay->>'installments')::int, 1),
      NULLIF(pay->>'cash_received', '')::numeric
    FROM jsonb_array_elements(p_payments) AS pay;
  END IF;

  -- Baixa de estoque
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    PERFORM public.apply_stock_movement(
      (v_item->>'product_id')::uuid,
      NULLIF(v_item->>'variation_id', '')::uuid,
      -abs((v_item->>'quantity')::numeric),
      'pdv_sale',
      v_order_id,
      'Venda PDV - pedido ' || left(v_order_id::text, 8)
    );
  END LOOP;

  -- Troco em cédulas
  IF p_cash_exchange IS NOT NULL AND p_cash_exchange->>'cash_register_id' IS NOT NULL THEN
    PERFORM public.apply_pdv_cash_exchange(
      (p_cash_exchange->>'cash_register_id')::uuid,
      COALESCE(p_cash_exchange->'received_denominations', '{}'::jsonb),
      COALESCE(p_cash_exchange->'change_denominations', '{}'::jsonb),
      COALESCE((p_cash_exchange->>'received_amount')::numeric, 0),
      COALESCE((p_cash_exchange->>'change_amount')::numeric, 0)
    );
  END IF;

  -- Promoções com limite de uso
  IF p_promo_items IS NOT NULL AND jsonb_array_length(p_promo_items) > 0 THEN
    PERFORM public.consume_promo_limits(p_promo_items);
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'already_registered', v_reused,
    'completed', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_pdv_sale(jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pdv_sale(jsonb, jsonb, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_pdv_sale(jsonb, jsonb, jsonb, jsonb, jsonb) TO service_role;