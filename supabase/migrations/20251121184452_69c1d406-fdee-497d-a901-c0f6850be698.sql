-- Criar tabela de clientes para o PDV
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  cpf TEXT NOT NULL UNIQUE,
  cep TEXT NOT NULL,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Habilitar RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Admins podem ver todos os clientes
CREATE POLICY "Admins podem ver clientes"
ON public.customers
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins podem inserir clientes
CREATE POLICY "Admins podem inserir clientes"
ON public.customers
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins podem atualizar clientes
CREATE POLICY "Admins podem atualizar clientes"
ON public.customers
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins podem deletar clientes
CREATE POLICY "Admins podem deletar clientes"
ON public.customers
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Adicionar coluna customer_id na tabela orders
ALTER TABLE public.orders
ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;