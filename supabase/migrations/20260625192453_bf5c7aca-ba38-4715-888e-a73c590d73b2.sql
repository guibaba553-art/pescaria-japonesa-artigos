DROP POLICY IF EXISTS "Admin gerencia presets" ON public.customer_score_reason_presets;
CREATE POLICY "Admin e funcionarios gerenciam presets"
ON public.customer_score_reason_presets
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));