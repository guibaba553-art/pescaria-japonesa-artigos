-- Add payment_id column to orders table to track Mercado Pago payments
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_id TEXT;

-- Add new payment status to order_status enum
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'aguardando_pagamento';

-- Create index for faster payment_id lookups
CREATE INDEX IF NOT EXISTS idx_orders_payment_id ON public.orders(payment_id);