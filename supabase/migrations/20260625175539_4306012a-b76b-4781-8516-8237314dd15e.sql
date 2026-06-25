
CREATE OR REPLACE FUNCTION public.can_access_pdv(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR public.has_role(_user_id, 'employee'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.employee_permissions
      WHERE user_id = _user_id AND can_access_pdv = true
    );
$$;

DROP POLICY IF EXISTS "Admin e employee podem inserir clientes" ON public.customers;
CREATE POLICY "Usuarios com acesso ao PDV podem inserir clientes"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_pdv(auth.uid()));

DROP POLICY IF EXISTS "Admin e employee podem ver clientes" ON public.customers;
CREATE POLICY "Usuarios com acesso ao PDV podem ver clientes"
  ON public.customers FOR SELECT
  TO authenticated
  USING (public.can_access_pdv(auth.uid()));

DROP POLICY IF EXISTS "Admin e employee podem atualizar clientes" ON public.customers;
CREATE POLICY "Usuarios com acesso ao PDV podem atualizar clientes"
  ON public.customers FOR UPDATE
  TO authenticated
  USING (public.can_access_pdv(auth.uid()))
  WITH CHECK (public.can_access_pdv(auth.uid()));
