CREATE TABLE IF NOT EXISTS public.employee_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  can_access_pdv boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam permissoes de funcionarios"
  ON public.employee_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Funcionarios veem suas proprias permissoes"
  ON public.employee_permissions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_employee_permissions_updated
  BEFORE UPDATE ON public.employee_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();