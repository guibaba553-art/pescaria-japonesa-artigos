ALTER TABLE public.products ADD COLUMN IF NOT EXISTS site_has_price boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.compute_site_has_price(p_id uuid, p_price numeric)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(p_price,0) > 0 OR EXISTS (
    SELECT 1 FROM public.product_variations v WHERE v.product_id = p_id AND coalesce(v.price,0) > 0)
$$;

CREATE OR REPLACE FUNCTION public.trg_products_site_has_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.site_has_price := public.compute_site_has_price(NEW.id, NEW.price);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS products_site_has_price_trg ON public.products;
CREATE TRIGGER products_site_has_price_trg BEFORE INSERT OR UPDATE OF price ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_products_site_has_price();

CREATE OR REPLACE FUNCTION public.trg_variations_site_has_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid := coalesce(NEW.product_id, OLD.product_id);
BEGIN
  UPDATE public.products p SET site_has_price = public.compute_site_has_price(p.id, p.price)
  WHERE p.id = pid AND p.site_has_price IS DISTINCT FROM public.compute_site_has_price(p.id, p.price);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS variations_site_has_price_trg ON public.product_variations;
CREATE TRIGGER variations_site_has_price_trg AFTER INSERT OR UPDATE OF price OR DELETE ON public.product_variations
FOR EACH ROW EXECUTE FUNCTION public.trg_variations_site_has_price();

UPDATE public.products p SET site_has_price = public.compute_site_has_price(p.id, p.price);