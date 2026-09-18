CREATE TABLE public.dashboard_day_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('pdv', 'site', 'all', 'traffic')),
  note_date date NOT NULL,
  note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 1000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, note_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_day_notes TO authenticated;
GRANT ALL ON public.dashboard_day_notes TO service_role;

ALTER TABLE public.dashboard_day_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dashboard users can view day notes"
ON public.dashboard_day_notes
FOR SELECT
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
);

CREATE POLICY "Dashboard users can create day notes"
ON public.dashboard_day_notes
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'employee'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.employee_permissions ep
        WHERE ep.user_id = auth.uid() AND ep.can_access_dashboard = true
      )
    )
  )
);

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
  created_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'employee'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.employee_permissions ep
        WHERE ep.user_id = auth.uid() AND ep.can_access_dashboard = true
      )
    )
  )
);

CREATE POLICY "Dashboard users can delete day notes"
ON public.dashboard_day_notes
FOR DELETE
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
);

CREATE TRIGGER set_dashboard_day_notes_updated_at
BEFORE UPDATE ON public.dashboard_day_notes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_now();