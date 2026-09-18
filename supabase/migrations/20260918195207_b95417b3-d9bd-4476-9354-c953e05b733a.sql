DROP POLICY "Dashboard users can update day notes" ON public.dashboard_day_notes;

CREATE POLICY "Dashboard users can update day notes"
ON public.dashboard_day_notes
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.employee_permissions ep
      WHERE ep.user_id = auth.uid() AND ep.can_access_dashboard = true
    )
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.employee_permissions ep
      WHERE ep.user_id = auth.uid() AND ep.can_access_dashboard = true
    )
  )
);