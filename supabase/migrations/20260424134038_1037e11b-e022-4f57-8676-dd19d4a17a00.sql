
-- ============================================================
-- Tabela de movimentações de estoque (livro-caixa)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variation_id UUID REFERENCES public.product_variations(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('sale', 'sale_revert', 'manual_adjust', 'nfe_entry', 'pdv_sale', 'initial')),
  quantity_delta INTEGER NOT NULL, -- negativo para saída, positivo para entrada
  stock_before INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  order_id UUID,
  reason TEXT,
  performed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_variation ON public.stock_movements(variation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order ON public.stock_movements(order_id) WHERE order_id IS NOT NULL;

-- Constraint de idempotência: cada (order_id, product_id, variation_id, movement_type='sale')
-- só pode existir UMA vez. Impede que webhook duplicado desconte estoque 2x.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movements_order_sale
  ON public.stock_movements(order_id, product_id, COALESCE(variation_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE order_id IS NOT NULL AND movement_type IN ('sale', 'pdv_sale');

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e employees podem ver movimentações"
  ON public.stock_movements FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Service role e admins podem inserir movimentações"
  ON public.stock_movements FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

-- ============================================================
-- Função atômica para aplicar movimentação de estoque
-- Usa SELECT ... FOR UPDATE para garantir que duas vendas
-- simultâneas não leiam o mesmo estoque inicial.
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_stock_movement(
  p_product_id UUID,
  p_variation_id UUID,
  p_quantity_delta INTEGER,
  p_movement_type TEXT,
  p_order_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stock INTEGER;
  v_new_stock INTEGER;
  v_movement_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  -- Idempotência: para vendas (sale/pdv_sale), se já existe movimentação para
  -- o mesmo pedido+produto+variação, NÃO faz nada (retorna o registro existente).
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

  -- Lock atômico na linha (FOR UPDATE) - impede leitura concorrente
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

  -- Bloqueia estoque negativo em vendas
  IF v_new_stock < 0 AND p_movement_type IN ('sale', 'pdv_sale') THEN
    RAISE EXCEPTION 'Estoque insuficiente: atual %, tentando descontar %', v_current_stock, abs(p_quantity_delta);
  END IF;

  -- Trava em zero para qualquer caso (não permite estoque negativo nunca)
  v_new_stock := GREATEST(0, v_new_stock);

  -- Atualizar tabela base
  IF p_variation_id IS NOT NULL THEN
    UPDATE public.product_variations
    SET stock = v_new_stock, updated_at = now()
    WHERE id = p_variation_id;
  ELSE
    UPDATE public.products
    SET stock = v_new_stock, updated_at = now()
    WHERE id = p_product_id;
  END IF;

  -- Registrar no livro-caixa
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
$$;

-- ============================================================
-- Função para reverter venda (devolução / cancelamento)
-- ============================================================
CREATE OR REPLACE FUNCTION public.revert_order_stock(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement RECORD;
  v_count INTEGER := 0;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Apenas administradores podem reverter estoque';
  END IF;

  -- Para cada movimentação de venda do pedido, criar a contrapartida
  FOR v_movement IN
    SELECT product_id, variation_id, quantity_delta
    FROM public.stock_movements
    WHERE order_id = p_order_id AND movement_type IN ('sale', 'pdv_sale')
  LOOP
    PERFORM public.apply_stock_movement(
      v_movement.product_id,
      v_movement.variation_id,
      -v_movement.quantity_delta, -- inverte o sinal
      'sale_revert',
      p_order_id,
      'Reversão automática do pedido'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'reverted_count', v_count);
END;
$$;

-- ============================================================
-- Função para reconciliar estoque a partir do livro-caixa.
-- Útil para corrigir desvios.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_stock(p_product_id UUID, p_variation_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_calculated INTEGER;
  v_current INTEGER;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem reconciliar estoque';
  END IF;

  IF p_variation_id IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity_delta), 0) INTO v_calculated
    FROM public.stock_movements
    WHERE variation_id = p_variation_id;

    SELECT stock INTO v_current FROM public.product_variations WHERE id = p_variation_id;
  ELSE
    SELECT COALESCE(SUM(quantity_delta), 0) INTO v_calculated
    FROM public.stock_movements
    WHERE product_id = p_product_id AND variation_id IS NULL;

    SELECT stock INTO v_current FROM public.products WHERE id = p_product_id;
  END IF;

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'variation_id', p_variation_id,
    'current_stock', v_current,
    'calculated_from_movements', v_calculated,
    'difference', v_current - v_calculated
  );
END;
$$;
