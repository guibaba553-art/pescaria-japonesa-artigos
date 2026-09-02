CREATE OR REPLACE FUNCTION public.get_product_variations_by_product(p_product_id uuid)
RETURNS SETOF public.product_variations
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'employee'::app_role)) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  RETURN QUERY SELECT * FROM public.product_variations WHERE product_id = p_product_id ORDER BY name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_product_variations_by_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_variations_by_product(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_variations_by_product(uuid) TO service_role;