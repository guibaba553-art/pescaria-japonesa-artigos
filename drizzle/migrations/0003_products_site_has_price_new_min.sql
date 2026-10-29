CREATE OR REPLACE FUNCTION public.trg_products_site_has_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.site_has_price := coalesce(NEW.min_sale_price,0) > 0 OR coalesce(NEW.price,0) > 0
    OR EXISTS (SELECT 1 FROM public.product_variations v WHERE v.product_id = NEW.id
               AND (coalesce(v.price,0) > 0 OR coalesce(v.min_sale_price,0) > 0));
  RETURN NEW;
END $$;