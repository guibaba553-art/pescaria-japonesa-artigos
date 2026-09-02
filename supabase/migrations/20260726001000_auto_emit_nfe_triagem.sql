-- Adiciona toggle de auto-emissão NF-e ao concluir triagem/retirada
ALTER TABLE public.focus_nfe_settings
ADD COLUMN IF NOT EXISTS auto_emit_nfe_triagem BOOLEAN NOT NULL DEFAULT false;
