CREATE OR REPLACE FUNCTION public.create_site_order(
  p_order jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order_id uuid;
  v_item jsonb;
  v_available numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;
  IF (p_order->>'user_id')::uuid IS DISTINCT FROM v_uid
     AND NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'employee')) THEN
    RAISE EXCEPTION 'Sem permissão para criar este pedido';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Pedido sem produtos';
  END IF;

  INSERT INTO public.orders (
    user_id, total_amount, shipping_cost, status, delivery_type,
    shipping_address, shipping_cep, shipping_recipient_name, shipping_recipient_phone,
    shipping_street, shipping_number, shipping_complement, shipping_neighborhood,
    shipping_city, shipping_uf, shipping_service_id,
    payment_method, payment_gateway, installments, source, notes, customer_id
  ) VALUES (
    (p_order->>'user_id')::uuid,
    (p_order->>'total_amount')::numeric,
    COALESCE((p_order->>'shipping_cost')::numeric, 0),
    COALESCE((p_order->>'status')::public.order_status, 'aguardando_pagamento'::public.order_status),
    COALESCE(p_order->>'delivery_type', 'delivery'),
    p_order->>'shipping_address',
    p_order->>'shipping_cep',
    p_order->>'shipping_recipient_name',
    p_order->>'shipping_recipient_phone',
    p_order->>'shipping_street',
    p_order->>'shipping_number',
    p_order->>'shipping_complement',
    p_order->>'shipping_neighborhood',
    p_order->>'shipping_city',
    p_order->>'shipping_uf',
    NULLIF(p_order->>'shipping_service_id', '')::int,
    p_order->>'payment_method',
    p_order->>'payment_gateway',
    COALESCE((p_order->>'installments')::int, 1),
    COALESCE(p_order->>'source', 'site'),
    p_order->>'notes',
    NULLIF(p_order->>'customer_id', '')::uuid
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, variation_id, quantity, price_at_purchase)
  SELECT
    v_order_id,
    (it->>'product_id')::uuid,
    NULLIF(it->>'variation_id', '')::uuid,
    (it->>'quantity')::numeric,
    (it->>'price_at_purchase')::numeric
  FROM jsonb_array_elements(p_items) AS it;

  -- Conferência de estoque disponível (considera reservas ativas)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_available := public.get_available_stock(
      (v_item->>'product_id')::uuid,
      NULLIF(v_item->>'variation_id', '')::uuid
    );
    IF COALESCE(v_available, 0) < (v_item->>'quantity')::numeric THEN
      RAISE EXCEPTION 'Estoque insuficiente para um dos produtos (disponível: %)', COALESCE(v_available, 0);
    END IF;
  END LOOP;

  -- Limite de promoções
  PERFORM public.consume_promo_limits(
    (SELECT jsonb_agg(jsonb_build_object(
      'product_id', it->>'product_id',
      'variation_id', it->>'variation_id',
      'quantity', (it->>'quantity')::numeric
    )) FROM jsonb_array_elements(p_items) AS it)
  );

  RETURN jsonb_build_object('order_id', v_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_site_order(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_site_order(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_site_order(jsonb, jsonb) TO service_role;