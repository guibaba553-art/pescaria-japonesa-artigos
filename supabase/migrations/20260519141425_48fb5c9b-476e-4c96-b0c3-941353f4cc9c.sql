
-- 1) Backfill: vincular customer_id = user_id onde houver customer correspondente
UPDATE public.orders o
SET customer_id = o.user_id
WHERE o.customer_id IS NULL
  AND o.user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = o.user_id);

-- 2) Trigger BEFORE INSERT para auto-vincular customer_id em novos pedidos
CREATE OR REPLACE FUNCTION public.auto_link_order_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NULL AND NEW.user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.customers WHERE id = NEW.user_id) THEN
      NEW.customer_id := NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_order_customer ON public.orders;
CREATE TRIGGER trg_auto_link_order_customer
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_order_customer();

-- 3) Pontos retroativos: gera +1 para cada pedido entregue/retirado que ficou sem evento
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT o.id, o.customer_id, o.status
    FROM public.orders o
    WHERE o.customer_id IS NOT NULL
      AND o.status IN ('entregado','retirado')
      AND NOT EXISTS (
        SELECT 1 FROM public.customer_score_events e
        WHERE e.order_id = o.id AND e.source = 'order_delivered'
      )
  LOOP
    INSERT INTO public.customer_score_events
      (customer_id, points_delta, reason, source, order_id, performed_by)
    VALUES
      (r.customer_id, 1, 'Compra concluída (' || r.status || ') — backfill', 'order_delivered', r.id, NULL);

    UPDATE public.customers
      SET score = COALESCE(score,0) + 1
      WHERE id = r.customer_id;
  END LOOP;
END $$;
