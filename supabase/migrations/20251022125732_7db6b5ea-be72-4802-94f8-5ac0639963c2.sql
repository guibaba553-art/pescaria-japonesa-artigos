-- Adicionar campo para múltiplas imagens nos produtos
ALTER TABLE public.products
ADD COLUMN images TEXT[] DEFAULT '{}';

-- Migrar imagens existentes para o novo formato
UPDATE public.products
SET images = ARRAY[image_url]
WHERE image_url IS NOT NULL;

-- Adicionar campo para rastrear mensagens não lidas
ALTER TABLE public.chat_messages
ADD COLUMN read_by_user BOOLEAN NOT NULL DEFAULT FALSE;