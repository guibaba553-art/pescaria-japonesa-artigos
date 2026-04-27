
-- 1) Hide internal cost/margin from public on products: keep table SELECT but revoke 'cost' column for anon/authenticated
REVOKE SELECT ON public.products FROM anon, authenticated;
GRANT SELECT (
  id, name, description, short_description, price, category, subcategory,
  brand, size, pound_test, image_url, images, rating, stock, featured,
  on_sale, sale_price, sale_ends_at, minimum_quantity, sku, sold_by_weight,
  weight_grams, length_cm, width_cm, height_cm, created_at, updated_at,
  ncm, cest, csosn, cfop, origem, unidade_comercial, include_in_nfe,
  price_credit_percent, price_debit_percent, price_pix_percent, price_cash_percent,
  price_pdv, min_stock, supplier_id, created_by
) ON public.products TO anon, authenticated;

-- 2) Restrict coupons public SELECT — replace permissive policy with code-only validation via RPC
DROP POLICY IF EXISTS "Todos podem ver cupons ativos para validar" ON public.coupons;
-- Public no longer SELECTs coupons directly; validate_coupon() (SECURITY DEFINER) handles validation.

-- 3) Lock down SECURITY DEFINER functions: revoke EXECUTE from anon/authenticated for internal-only RPCs.
-- Trigger functions and internal helpers should not be callable via PostgREST.
REVOKE EXECUTE ON FUNCTION public.apply_stock_movement(uuid, uuid, integer, text, uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.revert_order_stock(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.reconcile_stock(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.mark_labels_printed(uuid, uuid, integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.add_label_pending(uuid, uuid, integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_admin_access(text, text, uuid, uuid, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.validate_order_fiscal(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.check_fiscal_rate_limit(uuid, text, integer, integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated, public;

-- Trigger functions (never need to be called directly via API)
REVOKE EXECUTE ON FUNCTION public.auto_revert_stock_on_devolvido() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.ensure_single_default_address() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.ensure_single_default_payment_method() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_sku_change_clear_label() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_order_status_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.protect_primary_categories() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_product_rating() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.validate_order_status_transition() FROM anon, authenticated, public;

-- get_products_admin / get_product_admin: keep callable by authenticated (admin/employee gate is inside)
-- validate_coupon: keep callable (used by checkout for both anon and signed-in users)
-- has_role: keep callable (used by RLS policies indirectly; grant remains)
