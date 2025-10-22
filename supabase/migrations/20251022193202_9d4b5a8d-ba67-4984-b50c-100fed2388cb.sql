-- Criar tabela de auditoria para acessos administrativos
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  accessed_user_id UUID,
  ip_address TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para melhorar performance de consultas de auditoria
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_user ON public.admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_accessed_user ON public.admin_audit_log(accessed_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log(created_at DESC);

-- Habilitar RLS na tabela de auditoria
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Política: Apenas admins podem ver logs de auditoria
CREATE POLICY "Admins podem ver logs de auditoria"
ON public.admin_audit_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Política: Sistema pode inserir logs (authenticated users, será chamado via código)
CREATE POLICY "Sistema pode inserir logs de auditoria"
ON public.admin_audit_log
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Função helper para registrar acesso administrativo
CREATE OR REPLACE FUNCTION public.log_admin_access(
  p_action TEXT,
  p_table_name TEXT,
  p_record_id UUID DEFAULT NULL,
  p_accessed_user_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  -- Verificar se o usuário atual é admin ou employee
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role)) THEN
    RAISE EXCEPTION 'Apenas admins e funcionários podem registrar logs de auditoria';
  END IF;

  -- Inserir log de auditoria
  INSERT INTO public.admin_audit_log (
    admin_user_id,
    action,
    table_name,
    record_id,
    accessed_user_id,
    details
  ) VALUES (
    auth.uid(),
    p_action,
    p_table_name,
    p_record_id,
    p_accessed_user_id,
    p_details
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;