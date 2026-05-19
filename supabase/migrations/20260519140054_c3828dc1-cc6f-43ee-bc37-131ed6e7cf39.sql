
-- Backfill: para cada customer sem CEP, copia o CEP da última order delivery do mesmo user_id
UPDATE public.customers c
SET cep = sub.shipping_cep, updated_at = now()
FROM (
  SELECT DISTINCT ON (o.user_id) o.user_id, o.shipping_cep
  FROM public.orders o
  WHERE o.delivery_type = 'delivery'
    AND o.shipping_cep IS NOT NULL
    AND length(regexp_replace(o.shipping_cep, '\D', '', 'g')) = 8
  ORDER BY o.user_id, o.created_at DESC
) sub
WHERE c.id = sub.user_id
  AND (c.cep IS NULL OR c.cep = '' OR length(regexp_replace(c.cep, '\D', '', 'g')) <> 8);

-- Trigger: ao inserir nova order, preenche CEP do cliente se ainda vazio
CREATE OR REPLACE FUNCTION public.sync_order_address_to_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.delivery_type = 'delivery'
     AND NEW.shipping_cep IS NOT NULL
     AND length(regexp_replace(NEW.shipping_cep, '\D', '', 'g')) = 8 THEN
    UPDATE public.customers
    SET cep = NEW.shipping_cep, updated_at = now()
    WHERE id = NEW.user_id
      AND (cep IS NULL OR cep = '' OR length(regexp_replace(cep, '\D', '', 'g')) <> 8);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_order_address_to_customer_trg ON public.orders;
CREATE TRIGGER sync_order_address_to_customer_trg
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_address_to_customer();
