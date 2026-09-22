CREATE OR REPLACE FUNCTION public.validate_order_item_variation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product uuid;
BEGIN
  IF NEW.variation_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT product_id INTO v_product
  FROM public.product_variations
  WHERE id = NEW.variation_id;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Variação % não existe', NEW.variation_id;
  END IF;

  IF v_product <> NEW.product_id THEN
    RAISE EXCEPTION 'Variação % pertence ao produto %, não ao produto %', NEW.variation_id, v_product, NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_order_item_variation_trg ON public.order_items;
CREATE TRIGGER validate_order_item_variation_trg
BEFORE INSERT OR UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.validate_order_item_variation();