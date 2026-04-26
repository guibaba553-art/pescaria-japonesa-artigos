-- 1) Novo status intermediário
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'devolucao_solicitada';