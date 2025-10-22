-- Remover política que permite funcionários verem todos os perfis
DROP POLICY IF EXISTS "Admins e funcionários veem todos os perfis" ON public.profiles;

-- Criar política apenas para ADMINS verem todos os perfis
CREATE POLICY "Apenas admins veem todos os perfis"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));