-- Add new status 'aguardando_envio' to order_status enum
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'aguardando_envio';