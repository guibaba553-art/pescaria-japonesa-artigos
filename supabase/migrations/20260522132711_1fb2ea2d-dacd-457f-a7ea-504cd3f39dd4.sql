
-- Função para consumir limite de promoção (apenas site)
CREATE OR REPLACE FUNCTION public.consume_promo_limits(p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  v_product_id uuid;
  v_variation_id uuid;
  v_qty numeric;
  v_on_sale boolean;
  v_limit integer;
  v_sold integer;
  v_name text;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (item->>'product_id')::uuid;
    v_variation_id := NULLIF(item->>'variation_id','')::uuid;
    v_qty := (item->>'quantity')::numeric;

    IF v_variation_id IS NOT NULL THEN
      SELECT pv.on_sale, pv.sale_limit_qty, pv.sale_sold_qty, p.name
        INTO v_on_sale, v_limit, v_sold, v_name
      FROM product_variations pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.id = v_variation_id
      FOR UPDATE OF pv;

      IF v_on_sale AND v_limit IS NOT NULL THEN
        IF v_sold + v_qty > v_limit THEN
          RAISE EXCEPTION 'Limite de promoção atingido para "%": restam % unidade(s)', v_name, GREATEST(v_limit - v_sold, 0);
        END IF;
        UPDATE product_variations
          SET sale_sold_qty = sale_sold_qty + v_qty::integer,
              on_sale = CASE WHEN sale_sold_qty + v_qty::integer >= sale_limit_qty THEN false ELSE on_sale END
        WHERE id = v_variation_id;
      END IF;
    ELSE
      SELECT p.on_sale, p.sale_limit_qty, p.sale_sold_qty, p.name
        INTO v_on_sale, v_limit, v_sold, v_name
      FROM products p
      WHERE p.id = v_product_id
      FOR UPDATE;

      IF v_on_sale AND v_limit IS NOT NULL THEN
        IF v_sold + v_qty > v_limit THEN
          RAISE EXCEPTION 'Limite de promoção atingido para "%": restam % unidade(s)', v_name, GREATEST(v_limit - v_sold, 0);
        END IF;
        UPDATE products
          SET sale_sold_qty = sale_sold_qty + v_qty::integer,
              on_sale = CASE WHEN sale_sold_qty + v_qty::integer >= sale_limit_qty THEN false ELSE on_sale END
        WHERE id = v_product_id;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Função para liberar limite (em caso de cancelamento)
CREATE OR REPLACE FUNCTION public.release_promo_limits(p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  v_product_id uuid;
  v_variation_id uuid;
  v_qty numeric;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (item->>'product_id')::uuid;
    v_variation_id := NULLIF(item->>'variation_id','')::uuid;
    v_qty := (item->>'quantity')::numeric;

    IF v_variation_id IS NOT NULL THEN
      UPDATE product_variations
        SET sale_sold_qty = GREATEST(sale_sold_qty - v_qty::integer, 0)
      WHERE id = v_variation_id AND sale_limit_qty IS NOT NULL;
    ELSE
      UPDATE products
        SET sale_sold_qty = GREATEST(sale_sold_qty - v_qty::integer, 0)
      WHERE id = v_product_id AND sale_limit_qty IS NOT NULL;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_promo_limits(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_promo_limits(jsonb) TO authenticated, service_role;
