-- Remover política de INSERT insegura que permite qualquer usuário criar logs
DROP POLICY IF EXISTS "Sistema pode inserir logs de auditoria" ON public.admin_audit_log;

-- A função log_admin_access() já é SECURITY DEFINER e pode inserir logs
-- sem precisar de política RLS, garantindo que apenas código confiável
-- do servidor pode criar registros de auditoria