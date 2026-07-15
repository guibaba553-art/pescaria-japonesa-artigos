-- Ensure gateway columns exist (idempotent)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS asaas_payment_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_gateway text;

-- Fix stock return trigger
DROP TRIGGER IF EXISTS auto_revert_stock_on_devolvido ON orders;

CREATE OR REPLACE FUNCTION auto_revert_stock_on_devolvido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mov RECORD;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'devolvido' THEN
    FOR mov IN
      SELECT product_id, variation_id, quantity_delta
      FROM stock_movements
      WHERE order_id = NEW.id
        AND movement_type IN ('sale', 'pdv_sale')
    LOOP
      PERFORM apply_stock_movement(
        p_product_id := mov.product_id,
        p_variation_id := mov.variation_id,
        p_quantity_delta := ABS(mov.quantity_delta),
        p_movement_type := 'sale_revert',
        p_order_id := NEW.id,
        p_reason := 'Devolucao do pedido'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_revert_stock_on_devolvido
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION auto_revert_stock_on_devolvido();

-- Backfill payment_gateway
UPDATE orders SET payment_gateway = 'asaas'
WHERE payment_gateway IS NULL AND asaas_payment_id IS NOT NULL;

UPDATE orders SET payment_gateway = 'mercadopago'
WHERE payment_gateway IS NULL AND payment_id IS NOT NULL
  AND asaas_payment_id IS NULL
  AND payment_method IN ('pix', 'credit_card', 'debit_card');

UPDATE orders SET payment_gateway = 'abacatepay'
WHERE payment_gateway IS NULL AND payment_id IS NOT NULL
  AND asaas_payment_id IS NULL
  AND payment_method = 'abacatepay_checkout';