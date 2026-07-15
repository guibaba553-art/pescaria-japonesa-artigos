ALTER TABLE public.purchase_lists ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_lists ADD COLUMN IF NOT EXISTS is_auto BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_lists_auto_supplier ON public.purchase_lists(supplier_id) WHERE is_auto = true;
ALTER TABLE public.purchase_list_items ADD COLUMN IF NOT EXISTS is_auto BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.reorder_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  variation_id UUID,
  error_message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reorder_errors TO authenticated;
GRANT ALL ON public.reorder_errors TO service_role;
ALTER TABLE public.reorder_errors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins e employees veem erros de reorder" ON public.reorder_errors;
CREATE POLICY "Admins e employees veem erros de reorder" ON public.reorder_errors FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));
DROP POLICY IF EXISTS "Trigger pode inserir erros de reorder" ON public.reorder_errors;
CREATE POLICY "Trigger pode inserir erros de reorder" ON public.reorder_errors FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.suggest_reorder_qty(p_product_id UUID, p_current_stock INTEGER, p_min_stock INTEGER)
RETURNS INTEGER LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $function$
DECLARE v_sold NUMERIC; v_per_day NUMERIC; v_target_30d NUMERIC; v_need NUMERIC;
BEGIN
  SELECT COALESCE(SUM(oi.quantity), 0) INTO v_sold
  FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.product_id = p_product_id
    AND o.created_at >= now() - interval '60 days'
    AND o.status = ANY(ARRAY['em_preparo'::order_status,'enviado'::order_status,'entregado'::order_status,'retirado'::order_status]);
  IF v_sold = 0 THEN RETURN GREATEST(p_min_stock - p_current_stock, 1); END IF;
  v_per_day := v_sold / 60.0;
  v_target_30d := ceil(v_per_day * 30);
  v_need := GREATEST(v_target_30d - p_current_stock, p_min_stock - p_current_stock, 1);
  RETURN GREATEST(1, v_need::INTEGER);
END; $function$;
GRANT EXECUTE ON FUNCTION public.suggest_reorder_qty(UUID, INTEGER, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_and_reorder()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_product_id UUID; v_supplier_id UUID; v_min_stock INTEGER; v_current_stock INTEGER;
  v_list_id UUID; v_suggested_qty INTEGER; v_supplier_name TEXT; v_is_variation BOOLEAN;
  v_old_min_stock INTEGER; v_new_min_stock INTEGER; v_is_supplier_change BOOLEAN;
BEGIN
  v_is_variation := (TG_TABLE_NAME = 'product_variations');
  v_is_supplier_change := (TG_NAME = 'trg_auto_reorder_supplier');
  IF v_is_variation THEN
    v_product_id := NEW.product_id; v_current_stock := NEW.stock; v_min_stock := NEW.min_stock;
    v_old_min_stock := OLD.min_stock; v_new_min_stock := NEW.min_stock;
    IF v_min_stock = 0 THEN SELECT COALESCE(min_stock,0) INTO v_min_stock FROM public.products WHERE id = v_product_id; END IF;
    SELECT supplier_id INTO v_supplier_id FROM public.products WHERE id = v_product_id;
  ELSE
    v_product_id := NEW.id; v_current_stock := NEW.stock; v_min_stock := NEW.min_stock;
    v_supplier_id := NEW.supplier_id; v_old_min_stock := OLD.min_stock; v_new_min_stock := NEW.min_stock;
  END IF;
  BEGIN
    IF v_is_supplier_change THEN
      IF OLD.supplier_id IS NOT NULL THEN
        DELETE FROM public.purchase_list_items pli USING public.purchase_lists pl
        WHERE pli.list_id = pl.id AND pl.supplier_id = OLD.supplier_id AND pl.is_auto = true
          AND pli.product_id = v_product_id AND pli.is_auto = true;
      END IF;
      IF v_current_stock <= v_min_stock AND NEW.supplier_id IS NOT NULL THEN
        SELECT id INTO v_list_id FROM public.purchase_lists WHERE supplier_id = NEW.supplier_id AND is_auto = true;
        IF v_list_id IS NULL THEN
          SELECT COALESCE(nome_fantasia, razao_social) INTO v_supplier_name FROM public.suppliers WHERE id = NEW.supplier_id;
          INSERT INTO public.purchase_lists (name, supplier_id, is_auto, created_by)
          VALUES ('🔄 Reposição - ' || v_supplier_name, NEW.supplier_id, true, '00000000-0000-0000-0000-000000000000')
          RETURNING id INTO v_list_id;
        END IF;
        v_suggested_qty := public.suggest_reorder_qty(v_product_id, v_current_stock, v_min_stock);
        INSERT INTO public.purchase_list_items (list_id, product_id, variation_id, quantity, is_auto, added_by)
        VALUES (v_list_id, v_product_id, CASE WHEN v_is_variation THEN NEW.id ELSE NULL END, v_suggested_qty, true, '00000000-0000-0000-0000-000000000000')
        ON CONFLICT (list_id, product_id, variation_id) DO UPDATE SET quantity = v_suggested_qty, is_auto = true;
      END IF;
      RETURN NEW;
    END IF;
    IF v_min_stock = 0 OR v_supplier_id IS NULL THEN RETURN NEW; END IF;
    IF v_current_stock > v_min_stock THEN
      DECLARE v_was_below BOOLEAN; v_old_effective_min INTEGER;
      BEGIN
        IF v_is_variation AND OLD.min_stock = 0 THEN
          SELECT COALESCE(min_stock,0) INTO v_old_effective_min FROM public.products WHERE id = v_product_id;
        ELSE v_old_effective_min := OLD.min_stock; END IF;
        IF TG_NAME IN ('trg_auto_reorder_min_stock','trg_auto_reorder_variation_min_stock') THEN
          v_was_below := (OLD.stock <= v_old_min_stock);
        ELSE v_was_below := (OLD.stock <= v_old_effective_min); END IF;
        IF v_was_below THEN
          DELETE FROM public.purchase_list_items pli USING public.purchase_lists pl
          WHERE pli.list_id = pl.id AND pl.supplier_id = v_supplier_id AND pl.is_auto = true
            AND pli.product_id = v_product_id
            AND (CASE WHEN v_is_variation THEN pli.variation_id = NEW.id ELSE pli.variation_id IS NULL END)
            AND pli.is_auto = true;
        END IF;
        RETURN NEW;
      END;
    END IF;
    DECLARE v_crossed BOOLEAN;
    BEGIN
      v_crossed := false;
      IF TG_NAME IN ('trg_auto_reorder_min_stock','trg_auto_reorder_variation_min_stock') THEN
        IF OLD.stock > v_old_min_stock AND NEW.stock <= v_new_min_stock THEN v_crossed := true; END IF;
      ELSE
        IF OLD.stock > OLD.min_stock THEN v_crossed := true; END IF;
      END IF;
      IF NOT v_crossed THEN RETURN NEW; END IF;
      SELECT id INTO v_list_id FROM public.purchase_lists WHERE supplier_id = v_supplier_id AND is_auto = true;
      IF v_list_id IS NULL THEN
        SELECT COALESCE(nome_fantasia, razao_social) INTO v_supplier_name FROM public.suppliers WHERE id = v_supplier_id;
        INSERT INTO public.purchase_lists (name, supplier_id, is_auto, created_by)
        VALUES ('🔄 Reposição - ' || v_supplier_name, v_supplier_id, true, '00000000-0000-0000-0000-000000000000')
        RETURNING id INTO v_list_id;
      END IF;
      v_suggested_qty := public.suggest_reorder_qty(v_product_id, v_current_stock, v_min_stock);
      INSERT INTO public.purchase_list_items (list_id, product_id, variation_id, quantity, is_auto, added_by)
      VALUES (v_list_id, v_product_id, CASE WHEN v_is_variation THEN NEW.id ELSE NULL END, v_suggested_qty, true, '00000000-0000-0000-0000-000000000000')
      ON CONFLICT (list_id, product_id, variation_id) DO UPDATE SET quantity = v_suggested_qty, is_auto = true;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.reorder_errors (product_id, variation_id, error_message)
    VALUES (v_product_id, CASE WHEN v_is_variation THEN NEW.id ELSE NULL END, 'check_and_reorder: ' || SQLERRM);
  END;
  RETURN NEW;
END; $function$;
GRANT EXECUTE ON FUNCTION public.check_and_reorder() TO authenticated;

DROP TRIGGER IF EXISTS trg_auto_reorder_stock ON public.products;
CREATE TRIGGER trg_auto_reorder_stock AFTER UPDATE OF stock ON public.products FOR EACH ROW EXECUTE FUNCTION public.check_and_reorder();
DROP TRIGGER IF EXISTS trg_auto_reorder_min_stock ON public.products;
CREATE TRIGGER trg_auto_reorder_min_stock AFTER UPDATE OF min_stock ON public.products FOR EACH ROW EXECUTE FUNCTION public.check_and_reorder();
DROP TRIGGER IF EXISTS trg_auto_reorder_supplier ON public.products;
CREATE TRIGGER trg_auto_reorder_supplier AFTER UPDATE OF supplier_id ON public.products FOR EACH ROW EXECUTE FUNCTION public.check_and_reorder();
DROP TRIGGER IF EXISTS trg_auto_reorder_variation_stock ON public.product_variations;
CREATE TRIGGER trg_auto_reorder_variation_stock AFTER UPDATE OF stock ON public.product_variations FOR EACH ROW EXECUTE FUNCTION public.check_and_reorder();
DROP TRIGGER IF EXISTS trg_auto_reorder_variation_min_stock ON public.product_variations;
CREATE TRIGGER trg_auto_reorder_variation_min_stock AFTER UPDATE OF min_stock ON public.product_variations FOR EACH ROW EXECUTE FUNCTION public.check_and_reorder();

DO $$
DECLARE v_rec RECORD; v_list_id UUID; v_supplier_name TEXT; v_suggested_qty INTEGER;
BEGIN
  FOR v_rec IN
    SELECT p.id, p.stock::integer AS stock, p.min_stock, p.supplier_id FROM public.products p
    WHERE p.stock <= p.min_stock AND p.min_stock > 0 AND p.supplier_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.purchase_list_items pli JOIN public.purchase_lists pl ON pl.id = pli.list_id
        WHERE pli.product_id = p.id AND pli.variation_id IS NULL)
  LOOP
    SELECT id INTO v_list_id FROM public.purchase_lists WHERE supplier_id = v_rec.supplier_id AND is_auto = true;
    IF v_list_id IS NULL THEN
      SELECT COALESCE(nome_fantasia, razao_social) INTO v_supplier_name FROM public.suppliers WHERE id = v_rec.supplier_id;
      INSERT INTO public.purchase_lists (name, supplier_id, is_auto, created_by)
      VALUES ('🔄 Reposição - ' || v_supplier_name, v_rec.supplier_id, true, '00000000-0000-0000-0000-000000000000')
      RETURNING id INTO v_list_id;
    END IF;
    v_suggested_qty := public.suggest_reorder_qty(v_rec.id, v_rec.stock, v_rec.min_stock);
    INSERT INTO public.purchase_list_items (list_id, product_id, quantity, is_auto, added_by)
    VALUES (v_list_id, v_rec.id, v_suggested_qty, true, '00000000-0000-0000-0000-000000000000')
    ON CONFLICT (list_id, product_id, variation_id) DO UPDATE SET quantity = v_suggested_qty, is_auto = true;
  END LOOP;
END; $$;