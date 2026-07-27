ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'reembolsado';
ALTER TABLE public.focus_nfe_settings ADD COLUMN IF NOT EXISTS auto_emit_nfe_triagem BOOLEAN NOT NULL DEFAULT false;