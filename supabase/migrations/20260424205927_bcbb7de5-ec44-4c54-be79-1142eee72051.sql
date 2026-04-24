-- Allow employees to manage their own saved sales (PDV drafts).
-- Admins keep full access via existing policies.

CREATE POLICY "Funcionarios criam suas vendas salvas"
ON public.saved_sales
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role)
  AND user_id = auth.uid()
);

CREATE POLICY "Funcionarios veem suas vendas salvas"
ON public.saved_sales
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'employee'::app_role)
  AND user_id = auth.uid()
);

CREATE POLICY "Funcionarios atualizam suas vendas salvas"
ON public.saved_sales
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'employee'::app_role)
  AND user_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role)
  AND user_id = auth.uid()
);

CREATE POLICY "Funcionarios deletam suas vendas salvas"
ON public.saved_sales
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'employee'::app_role)
  AND user_id = auth.uid()
);