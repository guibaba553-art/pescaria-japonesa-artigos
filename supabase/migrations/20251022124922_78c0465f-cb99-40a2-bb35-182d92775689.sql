-- Adicionar campos de controle de resposta na tabela chat_messages
ALTER TABLE public.chat_messages
ADD COLUMN replied BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN replied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN replied_at TIMESTAMP WITH TIME ZONE;

-- Criar índice para melhor performance
CREATE INDEX idx_chat_messages_replied ON public.chat_messages(replied);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at DESC);