DROP POLICY IF EXISTS "Staff can view product change log" ON public.product_change_log;

CREATE POLICY "Catalog users can view product change log"
ON public.product_change_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'employee'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.employee_permissions ep
    WHERE ep.user_id = auth.uid() AND ep.can_access_catalog = true
  )
);

GRANT SELECT ON public.product_change_log TO authenticated;