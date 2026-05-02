
-- Aceitar quantidades fracionadas em itens de pedido
ALTER TABLE public.order_items
  ALTER COLUMN quantity TYPE numeric USING quantity::numeric;

-- Aceitar movimentações de estoque fracionadas
ALTER TABLE public.stock_movements
  ALTER COLUMN quantity_delta TYPE numeric USING quantity_delta::numeric,
  ALTER COLUMN stock_before TYPE numeric USING stock_before::numeric,
  ALTER COLUMN stock_after TYPE numeric USING stock_after::numeric;

-- Estoque pode ser fracionado (vendas por peso)
ALTER TABLE public.products
  ALTER COLUMN stock TYPE numeric USING stock::numeric;

ALTER TABLE public.product_variations
  ALTER COLUMN stock TYPE numeric USING stock::numeric;

-- Atualizar função para aceitar numeric
CREATE OR REPLACE FUNCTION public.apply_stock_movement(
  p_product_id uuid,
  p_variation_id uuid,
  p_quantity_delta numeric,
  p_movement_type text,
  p_order_id uuid DEFAULT NULL::uuid,
  p_reason text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_stock NUMERIC;
  v_new_stock NUMERIC;
  v_movement_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF p_order_id IS NOT NULL AND p_movement_type IN ('sale', 'pdv_sale') THEN
    SELECT id INTO v_movement_id
    FROM public.stock_movements
    WHERE order_id = p_order_id
      AND product_id = p_product_id
      AND COALESCE(variation_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_variation_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND movement_type IN ('sale', 'pdv_sale')
    LIMIT 1;

    IF v_movement_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'skipped', true,
        'reason', 'already_processed',
        'movement_id', v_movement_id
      );
    END IF;
  END IF;

  IF p_variation_id IS NOT NULL THEN
    SELECT stock INTO v_current_stock
    FROM public.product_variations
    WHERE id = p_variation_id
    FOR UPDATE;
  ELSE
    SELECT stock INTO v_current_stock
    FROM public.products
    WHERE id = p_product_id
    FOR UPDATE;
  END IF;

  IF v_current_stock IS NULL THEN
    RAISE EXCEPTION 'Produto ou variação não encontrado';
  END IF;

  v_new_stock := v_current_stock + p_quantity_delta;

  IF v_new_stock < 0 AND p_movement_type IN ('sale', 'pdv_sale') THEN
    RAISE EXCEPTION 'Estoque insuficiente: atual %, tentando descontar %', v_current_stock, abs(p_quantity_delta);
  END IF;

  v_new_stock := GREATEST(0, v_new_stock);

  IF p_variation_id IS NOT NULL THEN
    UPDATE public.product_variations
    SET stock = v_new_stock, updated_at = now()
    WHERE id = p_variation_id;
  ELSE
    UPDATE public.products
    SET stock = v_new_stock, updated_at = now()
    WHERE id = p_product_id;
  END IF;

  INSERT INTO public.stock_movements (
    product_id, variation_id, movement_type, quantity_delta,
    stock_before, stock_after, order_id, reason, performed_by
  ) VALUES (
    p_product_id, p_variation_id, p_movement_type, p_quantity_delta,
    v_current_stock, v_new_stock, p_order_id, p_reason, v_user_id
  )
  RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'stock_before', v_current_stock,
    'stock_after', v_new_stock
  );
END;
$function$;
