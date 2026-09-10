CREATE TABLE public.product_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  variation_id uuid,
  product_name text,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.product_change_log TO authenticated;
GRANT ALL ON public.product_change_log TO service_role;

ALTER TABLE public.product_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view product change log"
ON public.product_change_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'));

CREATE INDEX idx_pcl_product ON public.product_change_log (product_id, created_at DESC);
CREATE INDEX idx_pcl_variation ON public.product_change_log (variation_id, created_at DESC);
CREATE INDEX idx_pcl_created ON public.product_change_log (created_at DESC);

CREATE OR REPLACE FUNCTION public.log_product_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f text;
  ov text;
  nv text;
  fields text[] := ARRAY['sku','stock','price','sale_price','sale_price_pdv','sale_starts_at','sale_ends_at','sale_channel','name','cost_price','ncm','category','subcategory'];
  oldrow jsonb := to_jsonb(OLD);
  newrow jsonb := to_jsonb(NEW);
  pname text;
  pid uuid;
  vid uuid;
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    pid := NEW.id;
    vid := NULL;
    pname := NEW.name;
  ELSE
    pid := NEW.product_id;
    vid := NEW.id;
    SELECT p.name INTO pname FROM public.products p WHERE p.id = NEW.product_id;
  END IF;

  FOREACH f IN ARRAY fields LOOP
    IF (oldrow ? f) AND (newrow ? f) THEN
      ov := oldrow->>f;
      nv := newrow->>f;
      IF ov IS DISTINCT FROM nv THEN
        INSERT INTO public.product_change_log (product_id, variation_id, product_name, field_name, old_value, new_value, changed_by)
        VALUES (pid, vid, pname, f, ov, nv, auth.uid());
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_product_changes
AFTER UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.log_product_changes();

CREATE TRIGGER trg_log_variation_changes
AFTER UPDATE ON public.product_variations
FOR EACH ROW EXECUTE FUNCTION public.log_product_changes();