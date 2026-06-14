-- Add pix_attempts column to orders table for limiting PIX regeneration attempts
ALTER TABLE orders ADD COLUMN pix_attempts integer DEFAULT 0;

-- Index for finding pending PIX orders with remaining attempts
CREATE INDEX IF NOT EXISTS idx_orders_pix_attempts ON orders (pix_attempts)
  WHERE status = 'aguardando_pagamento';
