-- Habilitar replica identity para capturar todas as mudanças na tabela orders
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- Adicionar a tabela orders à publicação do realtime para atualizações em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;