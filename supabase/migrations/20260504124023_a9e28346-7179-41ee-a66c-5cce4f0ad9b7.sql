
-- Listas de compra (recompra de fornecedores)
CREATE TABLE public.purchase_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_list_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID NOT NULL REFERENCES public.purchase_lists(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  variation_id UUID,
  quantity NUMERIC NOT NULL DEFAULT 1,
  added_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (list_id, product_id, variation_id)
);

CREATE INDEX idx_purchase_list_items_list ON public.purchase_list_items(list_id);

ALTER TABLE public.purchase_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_list_items ENABLE ROW LEVEL SECURITY;

-- Listas: admins e funcionários podem ver e gerenciar todas
CREATE POLICY "Admins e employees veem listas"
  ON public.purchase_lists FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins e employees criam listas"
  ON public.purchase_lists FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role)) AND created_by = auth.uid());

CREATE POLICY "Admins e employees atualizam listas"
  ON public.purchase_lists FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins e employees deletam listas"
  ON public.purchase_lists FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins e employees veem itens"
  ON public.purchase_list_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins e employees criam itens"
  ON public.purchase_list_items FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role)) AND added_by = auth.uid());

CREATE POLICY "Admins e employees atualizam itens"
  ON public.purchase_list_items FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins e employees deletam itens"
  ON public.purchase_list_items FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE TRIGGER update_purchase_lists_updated_at
  BEFORE UPDATE ON public.purchase_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_purchase_list_items_updated_at
  BEFORE UPDATE ON public.purchase_list_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
