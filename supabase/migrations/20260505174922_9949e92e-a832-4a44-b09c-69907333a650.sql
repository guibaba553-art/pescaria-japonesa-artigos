CREATE OR REPLACE FUNCTION public.apply_stock_movement(
  p_product_id uuid,
  p_variation_id uuid,
  p_quantity_delta numeric,
  p_movement_type text,
  p_order_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
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
  v_movement_type text;
BEGIN
  v_user_id := auth.uid();

  v_movement_type := lower(trim(coalesce(p_movement_type, '')));
  v_movement_type := CASE v_movement_type
    WHEN 'manual' THEN 'manual_adjust'
    WHEN 'manual_entry' THEN 'manual_adjust'
    WHEN 'manual-update' THEN 'manual_adjust'
    WHEN 'manual_update' THEN 'manual_adjust'
    WHEN 'adjustment' THEN 'manual_adjust'
    WHEN 'inventory_adjustment' THEN 'manual_adjust'
    ELSE v_movement_type
  END;

  IF v_movement_type = '' THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido: vazio';
  END IF;

  IF v_movement_type NOT IN ('sale', 'sale_revert', 'manual_adjust', 'nfe_entry', 'pdv_sale', 'initial') THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido: %', p_movement_type;
  END IF;

  IF p_order_id IS NOT NULL AND v_movement_type IN ('sale', 'pdv_sale') THEN
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

  IF v_new_stock < 0 AND v_movement_type IN ('sale', 'pdv_sale') THEN
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
    p_product_id, p_variation_id, v_movement_type, p_quantity_delta,
    v_current_stock, v_new_stock, p_order_id, p_reason, v_user_id
  )
  RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'stock_before', v_current_stock,
    'stock_after', v_new_stock,
    'movement_type', v_movement_type
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.apply_stock_movement(uuid, uuid, numeric, text, uuid, text) TO authenticated;