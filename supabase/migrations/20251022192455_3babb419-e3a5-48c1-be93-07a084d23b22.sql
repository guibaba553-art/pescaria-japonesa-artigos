-- Política para permitir que admins deletem pedidos
CREATE POLICY "Admins podem deletar pedidos"
ON public.orders
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Política para permitir que admins deletem itens de pedidos (em cascata)
CREATE POLICY "Admins podem deletar itens de pedidos"
ON public.order_items
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_items.order_id
    AND orders.user_id = auth.uid()
  )
);