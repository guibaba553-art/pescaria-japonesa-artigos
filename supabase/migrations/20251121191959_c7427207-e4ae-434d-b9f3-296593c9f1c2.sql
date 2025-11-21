-- Criar tabela para vendas salvas (rascunhos)
CREATE TABLE public.saved_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  cart_data JSONB NOT NULL,
  customer_data JSONB,
  payment_method TEXT,
  total_amount NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.saved_sales ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Admins podem ver vendas salvas"
ON public.saved_sales
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem criar vendas salvas"
ON public.saved_sales
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem atualizar vendas salvas"
ON public.saved_sales
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem deletar vendas salvas"
ON public.saved_sales
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_saved_sales_updated_at
BEFORE UPDATE ON public.saved_sales
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();