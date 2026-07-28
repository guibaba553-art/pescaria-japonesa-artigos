CREATE OR REPLACE FUNCTION public.expire_finished_promotions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_products_updated int;
  v_variations_updated int;
BEGIN
  UPDATE public.products
     SET on_sale = false
   WHERE on_sale = true
     AND sale_ends_at IS NOT NULL
     AND sale_ends_at <= now();
  GET DIAGNOSTICS v_products_updated = ROW_COUNT;

  UPDATE public.product_variations
     SET on_sale = false
   WHERE on_sale = true
     AND sale_ends_at IS NOT NULL
     AND sale_ends_at <= now();
  GET DIAGNOSTICS v_variations_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'products_expired', v_products_updated,
    'variations_expired', v_variations_updated,
    'ran_at', now()
  );
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-finished-promotions-hourly') THEN
    PERFORM cron.unschedule('expire-finished-promotions-hourly');
  END IF;
END $$;

SELECT cron.schedule(
  'expire-finished-promotions-hourly',
  '0 * * * *',
  $$SELECT public.expire_finished_promotions();$$
);

-- Executa imediatamente para limpar o estado atual
SELECT public.expire_finished_promotions();