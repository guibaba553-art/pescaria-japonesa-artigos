CREATE OR REPLACE FUNCTION public.get_incomplete_sales(p_limit int DEFAULT 200)
RETURNS TABLE (
  order_id uuid,
  created_at timestamptz,
  source text,
  status public.order_status,
  payment_method text,
  total_amount numeric,
  customer_name text,
  item_count bigint,
  stock_movement_count bigint,
  has_fiscal boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.created_at,
    o.source,
    o.status,
    o.payment_method,
    o.total_amount,
    c.full_name,
    (SELECT count(*) FROM public.order_items oi WHERE oi.order_id = o.id),
    (SELECT count(*) FROM public.stock_movements sm WHERE sm.order_id = o.id),
    EXISTS (SELECT 1 FROM public.nfe_emissions ne WHERE ne.order_id = o.id)
  FROM public.orders o
  LEFT JOIN public.customers c ON c.id = o.customer_id
  WHERE (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'))
    AND o.status NOT IN ('aguardando_pagamento'::public.order_status, 'cancelado'::public.order_status)
    AND (
      NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id)
      OR NOT EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.order_id = o.id)
    )
  ORDER BY o.created_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 200), 1000));
$$;

REVOKE ALL ON FUNCTION public.get_incomplete_sales(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_incomplete_sales(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_incomplete_sales(int) TO service_role;