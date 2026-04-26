
-- Tabela de pendência de etiquetas
CREATE TABLE public.product_label_pending (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variation_id UUID REFERENCES public.product_variations(id) ON DELETE CASCADE,
  pending_qty INTEGER NOT NULL DEFAULT 0 CHECK (pending_qty >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unicidade por (produto, variação) — usar índices únicos parciais p/ tratar NULL
CREATE UNIQUE INDEX idx_label_pending_prod_var
  ON public.product_label_pending (product_id, variation_id)
  WHERE variation_id IS NOT NULL;

CREATE UNIQUE INDEX idx_label_pending_prod_only
  ON public.product_label_pending (product_id)
  WHERE variation_id IS NULL;

CREATE INDEX idx_label_pending_qty ON public.product_label_pending (pending_qty) WHERE pending_qty > 0;

-- Trigger updated_at
CREATE TRIGGER trg_label_pending_updated
  BEFORE UPDATE ON public.product_label_pending
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.product_label_pending ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e employees veem etiquetas pendentes"
  ON public.product_label_pending FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins e employees inserem etiquetas pendentes"
  ON public.product_label_pending FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins e employees atualizam etiquetas pendentes"
  ON public.product_label_pending FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins deletam etiquetas pendentes"
  ON public.product_label_pending FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Helper: SKU é considerado "interno gerado pelo sistema" se começa com 200 (EAN-13 prefixo interno)
-- ou se está vazio/nulo (produto sem código).
CREATE OR REPLACE FUNCTION public.sku_needs_label(_sku TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _sku IS NULL OR btrim(_sku) = '' OR _sku LIKE '200%';
$$;

-- Função: somar pendência (usada por NF-e de entrada e ajustes manuais)
CREATE OR REPLACE FUNCTION public.add_label_pending(
  p_product_id UUID,
  p_variation_id UUID,
  p_qty INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role)
       OR has_role(auth.uid(), 'employee'::app_role)
       OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Sem permissão para adicionar etiqueta pendente';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN NULL;
  END IF;

  IF p_variation_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.product_label_pending
      WHERE product_id = p_product_id AND variation_id = p_variation_id;
  ELSE
    SELECT id INTO v_id FROM public.product_label_pending
      WHERE product_id = p_product_id AND variation_id IS NULL;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.product_label_pending (product_id, variation_id, pending_qty)
      VALUES (p_product_id, p_variation_id, p_qty)
      RETURNING id INTO v_id;
  ELSE
    UPDATE public.product_label_pending
      SET pending_qty = pending_qty + p_qty,
          updated_at = now()
      WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- Função: marcar como etiquetadas (decrementar) — usada após imprimir
CREATE OR REPLACE FUNCTION public.mark_labels_printed(
  p_product_id UUID,
  p_variation_id UUID,
  p_qty INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INTEGER;
  v_new INTEGER;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role)
       OR has_role(auth.uid(), 'employee'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF p_variation_id IS NOT NULL THEN
    SELECT pending_qty INTO v_current FROM public.product_label_pending
      WHERE product_id = p_product_id AND variation_id = p_variation_id;
  ELSE
    SELECT pending_qty INTO v_current FROM public.product_label_pending
      WHERE product_id = p_product_id AND variation_id IS NULL;
  END IF;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('success', true, 'pending', 0);
  END IF;

  v_new := GREATEST(0, v_current - COALESCE(p_qty, v_current));

  IF p_variation_id IS NOT NULL THEN
    UPDATE public.product_label_pending
      SET pending_qty = v_new, updated_at = now()
      WHERE product_id = p_product_id AND variation_id = p_variation_id;
  ELSE
    UPDATE public.product_label_pending
      SET pending_qty = v_new, updated_at = now()
      WHERE product_id = p_product_id AND variation_id IS NULL;
  END IF;

  RETURN jsonb_build_object('success', true, 'pending', v_new);
END;
$$;

-- Trigger: ao mudar SKU para um código EXTERNO, zera a pendência
CREATE OR REPLACE FUNCTION public.handle_sku_change_clear_label()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se SKU mudou e o novo é externo (não precisa de etiqueta interna)
  IF (OLD.sku IS DISTINCT FROM NEW.sku) AND NOT public.sku_needs_label(NEW.sku) THEN
    IF TG_TABLE_NAME = 'products' THEN
      UPDATE public.product_label_pending
        SET pending_qty = 0, updated_at = now()
        WHERE product_id = NEW.id AND variation_id IS NULL;
    ELSIF TG_TABLE_NAME = 'product_variations' THEN
      UPDATE public.product_label_pending
        SET pending_qty = 0, updated_at = now()
        WHERE variation_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_sku_clear_label
  AFTER UPDATE OF sku ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.handle_sku_change_clear_label();

CREATE TRIGGER trg_variations_sku_clear_label
  AFTER UPDATE OF sku ON public.product_variations
  FOR EACH ROW EXECUTE FUNCTION public.handle_sku_change_clear_label();

-- Inicialização: produtos sem variação que precisam de etiqueta
INSERT INTO public.product_label_pending (product_id, variation_id, pending_qty)
SELECT p.id, NULL, p.stock
FROM public.products p
WHERE p.stock > 0
  AND public.sku_needs_label(p.sku)
  AND NOT EXISTS (SELECT 1 FROM public.product_variations v WHERE v.product_id = p.id);

-- Inicialização: variações que precisam de etiqueta
INSERT INTO public.product_label_pending (product_id, variation_id, pending_qty)
SELECT v.product_id, v.id, v.stock
FROM public.product_variations v
WHERE v.stock > 0
  AND public.sku_needs_label(v.sku);
