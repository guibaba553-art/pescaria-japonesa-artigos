CREATE OR REPLACE FUNCTION public.fill_product_fiscal_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.csosn IS NULL OR btrim(NEW.csosn) = '' THEN
    NEW.csosn := '102';
  END IF;
  IF NEW.origem IS NULL OR btrim(NEW.origem) = '' THEN
    NEW.origem := '0';
  END IF;
  IF NEW.unidade_comercial IS NULL OR btrim(NEW.unidade_comercial) = '' THEN
    NEW.unidade_comercial := 'UN';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_product_fiscal_defaults ON public.products;
CREATE TRIGGER trg_fill_product_fiscal_defaults
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.fill_product_fiscal_defaults();