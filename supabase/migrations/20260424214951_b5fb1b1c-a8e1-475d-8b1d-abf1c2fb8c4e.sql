-- Tornar explícita a política de acesso à tabela customers
-- Empregados NÃO devem ler dados de clientes PJ/PF (CPF/CNPJ/endereço) — apenas admins.
-- Adicionamos uma policy SELECT restritiva (RESTRICTIVE) que reforça a intenção,
-- mesmo na ausência de policy permissiva para employees.

-- Garantir que RLS está ativa
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

-- Política restritiva: somente admins podem ler customers (defesa em profundidade)
DROP POLICY IF EXISTS "Restrict customers SELECT to admins only" ON public.customers;
CREATE POLICY "Restrict customers SELECT to admins only"
ON public.customers
AS RESTRICTIVE
FOR SELECT
TO public
USING (has_role(auth.uid(), 'admin'::app_role));

-- Política restritiva equivalente para mutações (admin já tem permissive, mas reforçamos)
DROP POLICY IF EXISTS "Restrict customers writes to admins only" ON public.customers;
CREATE POLICY "Restrict customers writes to admins only"
ON public.customers
AS RESTRICTIVE
FOR ALL
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));