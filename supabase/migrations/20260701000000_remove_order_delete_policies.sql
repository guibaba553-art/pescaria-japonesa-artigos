-- Remover policies de DELETE em pedidos — pedidos nunca devem ser deletados
DROP POLICY IF EXISTS "Admins podem deletar pedidos" ON public.orders;
DROP POLICY IF EXISTS "Admins podem deletar itens de pedidos" ON public.order_items;
