DROP POLICY IF EXISTS "Sistema pode inserir NF-es" ON public.nfe_emissions;

CREATE POLICY "Admins e employees podem inserir NF-es"
ON public.nfe_emissions
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role)
);