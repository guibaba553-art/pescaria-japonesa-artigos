-- Adicionar coluna tracking_code na tabela orders
ALTER TABLE public.orders 
ADD COLUMN tracking_code TEXT;