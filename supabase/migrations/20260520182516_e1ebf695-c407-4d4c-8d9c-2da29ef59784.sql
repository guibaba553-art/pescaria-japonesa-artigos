
-- Permite que funcionários com permissão "Fiscal" gerenciem despesas e overrides
DROP POLICY IF EXISTS "Admins gerenciam despesas" ON public.expenses;
DROP POLICY IF EXISTS "Admins gerenciam overrides" ON public.expense_overrides;

CREATE POLICY "Admin ou funcionario fiscal gerencia despesas"
ON public.expenses
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'employee'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.employee_permissions ep
      WHERE ep.user_id = auth.uid() AND ep.can_access_fiscal = true
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'employee'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.employee_permissions ep
      WHERE ep.user_id = auth.uid() AND ep.can_access_fiscal = true
    )
  )
);

CREATE POLICY "Admin ou funcionario fiscal gerencia overrides"
ON public.expense_overrides
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'employee'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.employee_permissions ep
      WHERE ep.user_id = auth.uid() AND ep.can_access_fiscal = true
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'employee'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.employee_permissions ep
      WHERE ep.user_id = auth.uid() AND ep.can_access_fiscal = true
    )
  )
);
