
-- Libera reservas de estoque dos pedidos aguardando_pagamento sem payment_id
UPDATE public.stock_reservations
   SET released_at = now()
 WHERE released_at IS NULL
   AND order_id IN (
     SELECT id FROM public.orders
      WHERE status = 'aguardando_pagamento' AND payment_id IS NULL
   );

-- Remove esses pedidos abandonados e seus itens
DELETE FROM public.order_items
 WHERE order_id IN (
   SELECT id FROM public.orders
    WHERE status = 'aguardando_pagamento' AND payment_id IS NULL
 );

DELETE FROM public.orders
 WHERE status = 'aguardando_pagamento' AND payment_id IS NULL;
