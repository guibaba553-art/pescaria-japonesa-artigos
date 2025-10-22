-- Criar tabela de avaliações de produtos
CREATE TABLE public.reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(order_id, product_id)
);

-- Enable RLS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para reviews
CREATE POLICY "Todos podem ver avaliações"
ON public.reviews
FOR SELECT
USING (true);

CREATE POLICY "Usuários podem criar avaliações de seus pedidos"
ON public.reviews
FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_id 
    AND orders.user_id = auth.uid()
    AND orders.status = 'entregado'::order_status
  )
);

CREATE POLICY "Usuários podem atualizar suas próprias avaliações"
ON public.reviews
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas próprias avaliações"
ON public.reviews
FOR DELETE
USING (auth.uid() = user_id);

-- Função para atualizar a média de rating dos produtos
CREATE OR REPLACE FUNCTION public.update_product_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.products
  SET rating = (
    SELECT COALESCE(AVG(rating), 5.0)
    FROM public.reviews
    WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
  )
  WHERE id = COALESCE(NEW.product_id, OLD.product_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger para atualizar rating ao inserir/atualizar/deletar avaliação
CREATE TRIGGER update_product_rating_on_review
AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_product_rating();