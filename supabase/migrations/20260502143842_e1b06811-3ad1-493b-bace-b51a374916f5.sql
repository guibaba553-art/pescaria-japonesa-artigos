-- 1) Limpar pedidos PDV órfãos (sem itens) criados nas últimas 24h
DELETE FROM orders
WHERE source = 'pdv'
  AND created_at > now() - interval '24 hours'
  AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id);

-- 2) Remover duplicatas exatas: mesmo total, mesmo customer_id (ou null), mesmo source 'pdv',
--    com itens idênticos, criados em janela de 5 min — manter o mais antigo
WITH dup AS (
  SELECT o.id,
         ROW_NUMBER() OVER (
           PARTITION BY o.source, o.user_id, COALESCE(o.customer_id::text,'_'), o.total_amount,
                        (SELECT string_agg(oi.product_id::text || ':' || COALESCE(oi.variation_id::text,'_') || ':' || oi.quantity::text, '|' ORDER BY oi.product_id, oi.variation_id, oi.quantity)
                         FROM order_items oi WHERE oi.order_id = o.id),
                        date_trunc('minute', o.created_at) -- bucket grosseiro; refinamos abaixo
           ORDER BY o.created_at
         ) AS rn,
         o.created_at,
         FIRST_VALUE(o.created_at) OVER (
           PARTITION BY o.source, o.user_id, COALESCE(o.customer_id::text,'_'), o.total_amount,
                        (SELECT string_agg(oi.product_id::text || ':' || COALESCE(oi.variation_id::text,'_') || ':' || oi.quantity::text, '|' ORDER BY oi.product_id, oi.variation_id, oi.quantity)
                         FROM order_items oi WHERE oi.order_id = o.id)
           ORDER BY o.created_at
         ) AS first_created
  FROM orders o
  WHERE o.source = 'pdv'
    AND o.created_at > now() - interval '24 hours'
)
DELETE FROM orders
WHERE id IN (
  SELECT id FROM dup
  WHERE rn > 1
    AND created_at - first_created < interval '5 minutes'
);

-- 3) Adicionar coluna idempotency_key
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key text;

-- 4) Índice único parcial (apenas quando preenchido)
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_uniq
  ON orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;