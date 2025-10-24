-- Adicionar campo para tipo de entrega (delivery ou pickup)
ALTER TABLE public.orders 
ADD COLUMN delivery_type TEXT NOT NULL DEFAULT 'delivery' CHECK (delivery_type IN ('delivery', 'pickup'));

-- Adicionar comentário para documentação
COMMENT ON COLUMN public.orders.delivery_type IS 'Tipo de entrega: delivery (envio) ou pickup (retirada)';