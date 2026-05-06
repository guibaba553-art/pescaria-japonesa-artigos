-- Função utilitária de timestamp (caso ainda não exista)
CREATE OR REPLACE FUNCTION public.set_updated_at_now()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.cost_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  cost NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cost_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e employees veem grupos de custo"
ON public.cost_groups FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins gerenciam grupos de custo"
ON public.cost_groups FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_cost_groups_updated_at
BEFORE UPDATE ON public.cost_groups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

ALTER TABLE public.products
ADD COLUMN cost_group_id UUID REFERENCES public.cost_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_products_cost_group_id ON public.products(cost_group_id);

CREATE OR REPLACE FUNCTION public.sync_cost_group_to_products()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.cost IS DISTINCT FROM OLD.cost THEN
    UPDATE public.products
    SET cost = NEW.cost, updated_at = now()
    WHERE cost_group_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_cost_group_to_products
AFTER UPDATE ON public.cost_groups
FOR EACH ROW EXECUTE FUNCTION public.sync_cost_group_to_products();

CREATE OR REPLACE FUNCTION public.sync_product_cost_from_group()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  group_cost NUMERIC;
BEGIN
  IF NEW.cost_group_id IS NOT NULL AND
     (TG_OP = 'INSERT' OR NEW.cost_group_id IS DISTINCT FROM OLD.cost_group_id) THEN
    SELECT cost INTO group_cost FROM public.cost_groups WHERE id = NEW.cost_group_id;
    IF group_cost IS NOT NULL THEN
      NEW.cost := group_cost;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_product_cost_from_group
BEFORE INSERT OR UPDATE OF cost_group_id ON public.products
FOR EACH ROW EXECUTE FUNCTION public.sync_product_cost_from_group();