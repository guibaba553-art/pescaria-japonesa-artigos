-- Fix audit log RLS policy to restrict INSERT to only admins and employees
-- This prevents unauthorized users from inserting fake audit entries

DROP POLICY IF EXISTS "Sistema pode inserir logs de auditoria" ON public.admin_audit_log;

CREATE POLICY "Apenas admins e employees podem inserir logs"
ON public.admin_audit_log
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'employee'::app_role)
);