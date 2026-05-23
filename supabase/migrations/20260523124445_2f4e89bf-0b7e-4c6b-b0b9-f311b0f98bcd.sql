-- Remove restrictive policies that block everyone except admin
DROP POLICY IF EXISTS "Restrict customers SELECT to admins only" ON public.customers;
DROP POLICY IF EXISTS "Restrict customers writes to admins only" ON public.customers;

-- Drop old admin-only permissive policies to recreate including employees
DROP POLICY IF EXISTS "Admins podem ver clientes" ON public.customers;
DROP POLICY IF EXISTS "Admins podem inserir clientes" ON public.customers;
DROP POLICY IF EXISTS "Admins podem atualizar clientes" ON public.customers;

-- Recreate allowing admin OR employee
CREATE POLICY "Admin e employee podem ver clientes"
ON public.customers FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admin e employee podem inserir clientes"
ON public.customers FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admin e employee podem atualizar clientes"
ON public.customers FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

-- Delete continua só para admin (já existe a policy "Admins podem deletar clientes")
