DROP POLICY IF EXISTS "Funcionarios podem atualizar caixas que abriram" ON public.cash_registers;

CREATE POLICY "Funcionarios podem atualizar caixas"
ON public.cash_registers
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'employee'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'employee'::app_role));