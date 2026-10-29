CREATE OR REPLACE FUNCTION public.protect_product_history_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    IF EXISTS (SELECT 1 FROM public.order_items WHERE product_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.stock_movements WHERE product_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.order_items i JOIN public.product_variations v ON v.id = i.variation_id WHERE v.product_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.stock_movements m JOIN public.product_variations v ON v.id = m.variation_id WHERE v.product_id = OLD.id) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Este produto possui vendas ou movimentações de estoque e não pode ser excluído. Edite o cadastro para preservar o histórico.';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.order_items WHERE variation_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.stock_movements WHERE variation_id = OLD.id) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Esta variação possui vendas ou movimentações de estoque e não pode ser excluída. Edite o cadastro para preservar o histórico.';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_product_history_delete() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_product_history_delete BEFORE DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.protect_product_history_delete();
CREATE TRIGGER protect_variation_history_delete BEFORE DELETE ON public.product_variations FOR EACH ROW EXECUTE FUNCTION public.protect_product_history_delete();