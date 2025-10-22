-- Remover políticas existentes de SELECT na tabela profiles
DROP POLICY IF EXISTS "Usuários podem ver apenas seu próprio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Funcionários podem ver todos os perfis" ON public.profiles;

-- Criar política que bloqueia explicitamente acesso anônimo
CREATE POLICY "Bloquear acesso público anônimo"
ON public.profiles
FOR SELECT
TO anon
USING (false);

-- Permitir que usuários autenticados vejam apenas seu próprio perfil
CREATE POLICY "Usuários autenticados veem seu próprio perfil"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Permitir que admins e funcionários vejam todos os perfis
CREATE POLICY "Admins e funcionários veem todos os perfis"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'employee'::app_role)
);