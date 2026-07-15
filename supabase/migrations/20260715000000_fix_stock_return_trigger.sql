-- Drop old broken trigger
DROP TRIGGER IF EXISTS auto_revert_stock_on_devolvido ON orders;

-- Recreate with correct movement_type
CREATE OR REPLACE FUNCTION auto_revert_stock_on_devolvido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  mov RECORD;
BEGIN
  -- Only fire when status changes TO devolvido
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

-- Recreate trigger
CREATE TRIGGER auto_revert_stock_on_devolvido
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION auto_revert_stock_on_devolvido();
