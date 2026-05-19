
CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email integer;
  v_fiscal integer;
  v_pay integer;
  v_errors integer;
  v_audit integer;
BEGIN
  DELETE FROM public.email_send_log WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_email = ROW_COUNT;

  DELETE FROM public.fiscal_rate_limits WHERE window_start < now() - interval '7 days';
  GET DIAGNOSTICS v_fiscal = ROW_COUNT;

  DELETE FROM public.payment_rate_limits WHERE window_start < now() - interval '7 days';
  GET DIAGNOSTICS v_pay = ROW_COUNT;

  DELETE FROM public.error_logs WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS v_errors = ROW_COUNT;

  DELETE FROM public.admin_audit_log WHERE created_at < now() - interval '365 days';
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  RETURN jsonb_build_object(
    'email_send_log', v_email,
    'fiscal_rate_limits', v_fiscal,
    'payment_rate_limits', v_pay,
    'error_logs', v_errors,
    'admin_audit_log', v_audit,
    'run_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_logs() FROM PUBLIC, anon, authenticated;
