CREATE OR REPLACE FUNCTION public.compute_site_has_price(p_id uuid, p_price numeric)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(p_price,0) > 0
    OR coalesce((SELECT min_sale_price FROM public.products WHERE id = p_id),0) > 0
    OR EXISTS (SELECT 1 FROM public.product_variations v WHERE v.product_id = p_id
               AND (coalesce(v.price,0) > 0 OR coalesce(v.min_sale_price,0) > 0))
$$;
DROP TRIGGER IF EXISTS variations_site_has_price_trg ON public.product_variations;
CREATE TRIGGER variations_site_has_price_trg AFTER INSERT OR DELETE OR UPDATE OF price, min_sale_price ON public.product_variations FOR EACH ROW EXECUTE FUNCTION public.trg_variations_site_has_price();
DROP TRIGGER IF EXISTS products_site_has_price_trg ON public.products;
CREATE TRIGGER products_site_has_price_trg BEFORE INSERT OR UPDATE OF price, min_sale_price ON public.products FOR EACH ROW EXECUTE FUNCTION public.trg_products_site_has_price();
UPDATE public.products p SET site_has_price = public.compute_site_has_price(p.id, p.price)
WHERE p.site_has_price IS DISTINCT FROM public.compute_site_has_price(p.id, p.price);