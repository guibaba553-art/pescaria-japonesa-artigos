-- Restaurar EXECUTE para funções RPC usadas pelo painel admin/employee.
-- A migração de segurança anterior revogou indevidamente algumas RPCs que SÃO
-- chamadas pelo frontend autenticado. Cada função já valida permissões via
-- has_role()/auth.uid() internamente.

GRANT EXECUTE ON FUNCTION public.apply_stock_movement(uuid, uuid, integer, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_order_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stock(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_labels_printed(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_label_pending(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_access(text, text, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_order_fiscal(uuid) TO authenticated;