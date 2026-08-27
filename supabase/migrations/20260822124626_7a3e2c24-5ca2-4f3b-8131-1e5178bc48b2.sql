CREATE TABLE public.expense_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('fixed','variable')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin ou funcionario fiscal gerencia categorias de despesa"
ON public.expense_categories FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR (
    has_role(auth.uid(), 'employee'::app_role) AND EXISTS (
      SELECT 1 FROM public.employee_permissions ep
      WHERE ep.user_id = auth.uid() AND ep.can_access_fiscal = true
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR (
    has_role(auth.uid(), 'employee'::app_role) AND EXISTS (
      SELECT 1 FROM public.employee_permissions ep
      WHERE ep.user_id = auth.uid() AND ep.can_access_fiscal = true
    )
  )
);