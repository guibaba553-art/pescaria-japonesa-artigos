DROP POLICY IF EXISTS "Anyone can view category fiscal defaults" ON public.category_fiscal_defaults;
DROP POLICY IF EXISTS "Public can read category fiscal defaults" ON public.category_fiscal_defaults;
DROP POLICY IF EXISTS "category_fiscal_defaults_select" ON public.category_fiscal_defaults;
DROP POLICY IF EXISTS "Everyone can view category fiscal defaults" ON public.category_fiscal_defaults;

CREATE POLICY "Admins and employees can view category fiscal defaults"
ON public.category_fiscal_defaults
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'employee'::app_role)
);