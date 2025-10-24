-- Criar tabela de variações de produtos
CREATE TABLE public.product_variations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- Ex: "Tamanho", "Cor", "Modelo"
  value TEXT NOT NULL, -- Ex: "1", "2", "3" ou "Vermelho", "Azul"
  price_adjustment NUMERIC DEFAULT 0, -- Ajuste de preço (pode ser positivo ou negativo)
  stock INTEGER NOT NULL DEFAULT 0,
  sku TEXT, -- Código único da variação
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice para buscar variações de um produto
CREATE INDEX idx_product_variations_product_id ON public.product_variations(product_id);

-- Índice único para evitar variações duplicadas
CREATE UNIQUE INDEX idx_product_variations_unique ON public.product_variations(product_id, name, value);

-- Habilitar RLS
ALTER TABLE public.product_variations ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Todos podem ver variações"
ON public.product_variations
FOR SELECT
USING (true);

CREATE POLICY "Admins e employees podem inserir variações"
ON public.product_variations
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins e employees podem atualizar variações"
ON public.product_variations
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins e employees podem deletar variações"
ON public.product_variations
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_product_variations_updated_at
BEFORE UPDATE ON public.product_variations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();