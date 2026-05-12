
-- ============================================
-- Tabela de reservas temporárias de estoque
-- ============================================
CREATE TABLE public.stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  product_id UUID NOT NULL,
  variation_id UUID,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_reservations_active
  ON public.stock_reservations (product_id, variation_id)
  WHERE released_at IS NULL;

CREATE INDEX idx_stock_reservations_order ON public.stock_reservations (order_id);
CREATE INDEX idx_stock_reservations_expires ON public.stock_reservations (expires_at) WHERE released_at IS NULL;

ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e employees veem reservas"
  ON public.stock_reservations FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

-- writes feitos somente via SECURITY DEFINER functions / service role

-- ============================================
-- get_available_stock: estoque - reservas ativas
-- ============================================
CREATE OR REPLACE FUNCTION public.get_available_stock(
  p_product_id uuid,
  p_variation_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock NUMERIC;
  v_reserved NUMERIC;
BEGIN
  IF p_variation_id IS NOT NULL THEN
    SELECT stock INTO v_stock FROM product_variations WHERE id = p_variation_id;
  ELSE
    SELECT stock INTO v_stock FROM products WHERE id = p_product_id;
  END IF;

  IF v_stock IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_reserved
  FROM stock_reservations
  WHERE product_id = p_product_id
    AND COALESCE(variation_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = COALESCE(p_variation_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND released_at IS NULL
    AND expires_at > now();

  RETURN GREATEST(0, v_stock - v_reserved);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_stock(uuid, uuid) TO authenticated, anon;

-- ============================================
-- reserve_stock_for_order: cria reservas para um pedido
-- p_items: jsonb array [{product_id, variation_id, quantity}]
-- p_ttl_minutes: tempo de vida da reserva (default 30 min)
-- ============================================
CREATE OR REPLACE FUNCTION public.reserve_stock_for_order(
  p_order_id uuid,
  p_items jsonb,
  p_ttl_minutes integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_product_id uuid;
  v_variation_id uuid;
  v_qty numeric;
  v_stock numeric;
  v_reserved numeric;
  v_available numeric;
  v_expires timestamptz;
  v_created jsonb := '[]'::jsonb;
BEGIN
  v_expires := now() + (p_ttl_minutes || ' minutes')::interval;

  -- Se já existem reservas ATIVAS para este pedido, não duplicar
  IF EXISTS (
    SELECT 1 FROM stock_reservations
    WHERE order_id = p_order_id AND released_at IS NULL AND expires_at > now()
  ) THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'already_reserved');
  END IF;

  -- Limpa reservas antigas (expiradas/liberadas) do mesmo pedido
  DELETE FROM stock_reservations
  WHERE order_id = p_order_id
    AND (released_at IS NOT NULL OR expires_at <= now());

  -- Itera itens e tenta reservar com lock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_variation_id := NULLIF(v_item->>'variation_id', '')::uuid;
    v_qty := (v_item->>'quantity')::numeric;

    IF v_qty <= 0 THEN CONTINUE; END IF;

    -- Lock na linha do produto/variação
    IF v_variation_id IS NOT NULL THEN
      SELECT stock INTO v_stock FROM product_variations WHERE id = v_variation_id FOR UPDATE;
    ELSE
      SELECT stock INTO v_stock FROM products WHERE id = v_product_id FOR UPDATE;
    END IF;

    IF v_stock IS NULL THEN
      RAISE EXCEPTION 'Produto/variação não encontrado: %', COALESCE(v_variation_id::text, v_product_id::text);
    END IF;

    SELECT COALESCE(SUM(quantity), 0) INTO v_reserved
    FROM stock_reservations
    WHERE product_id = v_product_id
      AND COALESCE(variation_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(v_variation_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND released_at IS NULL
      AND expires_at > now();

    v_available := v_stock - v_reserved;

    IF v_available < v_qty THEN
      -- Rollback de tudo da transação
      RAISE EXCEPTION 'Estoque indisponível para % (disponível: %, solicitado: %)',
        COALESCE(v_variation_id::text, v_product_id::text), v_available, v_qty;
    END IF;

    INSERT INTO stock_reservations (order_id, product_id, variation_id, quantity, expires_at)
    VALUES (p_order_id, v_product_id, v_variation_id, v_qty, v_expires);

    v_created := v_created || jsonb_build_object(
      'product_id', v_product_id,
      'variation_id', v_variation_id,
      'quantity', v_qty
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'reserved', v_created, 'expires_at', v_expires);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_stock_for_order(uuid, jsonb, integer) TO authenticated;

-- ============================================
-- release_stock_reservation: libera reservas de um pedido
-- ============================================
CREATE OR REPLACE FUNCTION public.release_stock_reservation(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE stock_reservations
  SET released_at = now()
  WHERE order_id = p_order_id AND released_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'released', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_stock_reservation(uuid) TO authenticated;

-- ============================================
-- Atualizar apply_stock_movement: ao aplicar venda, libera reservas do pedido
-- ============================================
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

  -- Idempotência por pedido
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
        'success', true, 'skipped', true,
        'reason', 'already_processed', 'movement_id', v_movement_id
      );
    END IF;
  END IF;

  IF p_variation_id IS NOT NULL THEN
    SELECT stock INTO v_current_stock FROM public.product_variations WHERE id = p_variation_id FOR UPDATE;
  ELSE
    SELECT stock INTO v_current_stock FROM public.products WHERE id = p_product_id FOR UPDATE;
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
    UPDATE public.product_variations SET stock = v_new_stock, updated_at = now() WHERE id = p_variation_id;
  ELSE
    UPDATE public.products SET stock = v_new_stock, updated_at = now() WHERE id = p_product_id;
  END IF;

  INSERT INTO public.stock_movements (
    product_id, variation_id, movement_type, quantity_delta,
    stock_before, stock_after, order_id, reason, performed_by
  ) VALUES (
    p_product_id, p_variation_id, v_movement_type, p_quantity_delta,
    v_current_stock, v_new_stock, p_order_id, p_reason, v_user_id
  )
  RETURNING id INTO v_movement_id;

  -- Libera reservas do pedido (se for venda) — evita dupla contagem
  IF p_order_id IS NOT NULL AND v_movement_type IN ('sale', 'pdv_sale') THEN
    UPDATE public.stock_reservations
    SET released_at = now()
    WHERE order_id = p_order_id
      AND product_id = p_product_id
      AND COALESCE(variation_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_variation_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND released_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'movement_id', v_movement_id,
    'stock_before', v_current_stock, 'stock_after', v_new_stock,
    'movement_type', v_movement_type
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.apply_stock_movement(uuid, uuid, numeric, text, uuid, text) TO authenticated;
