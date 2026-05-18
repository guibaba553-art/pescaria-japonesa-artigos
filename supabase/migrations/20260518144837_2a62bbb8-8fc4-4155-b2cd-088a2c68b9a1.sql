CREATE OR REPLACE FUNCTION public.enforce_min_sale_price()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.min_sale_price IS NOT NULL AND NEW.min_sale_price > 0 THEN
    IF NEW.price IS NULL OR NEW.price < NEW.min_sale_price THEN
      NEW.price := NEW.min_sale_price;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_min_sale_price_products ON public.products;
CREATE TRIGGER trg_enforce_min_sale_price_products
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_min_sale_price();

DROP TRIGGER IF EXISTS trg_enforce_min_sale_price_variations ON public.product_variations;
CREATE TRIGGER trg_enforce_min_sale_price_variations
  BEFORE INSERT OR UPDATE ON public.product_variations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_min_sale_price();