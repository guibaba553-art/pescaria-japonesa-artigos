-- Remover políticas existentes da tabela profiles
DROP POLICY IF EXISTS "Apenas admins veem todos os perfis" ON public.profiles;
DROP POLICY IF EXISTS "Bloquear acesso público anônimo" ON public.profiles;
DROP POLICY IF EXISTS "Perfis são criados automaticamente" ON public.profiles;
DROP POLICY IF EXISTS "Usuários autenticados veem seu próprio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Usuários podem atualizar seu próprio perfil" ON public.profiles;

-- Política SELECT: Usuários veem APENAS seu próprio perfil
CREATE POLICY "Usuários veem apenas seu próprio perfil"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Política SELECT: Admins veem todos os perfis
CREATE POLICY "Admins veem todos os perfis"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Política INSERT: Perfis são criados automaticamente no signup
CREATE POLICY "Sistema cria perfis automaticamente"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Política UPDATE: Usuários atualizam APENAS seu próprio perfil
CREATE POLICY "Usuários atualizam apenas seu próprio perfil"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Política UPDATE: Admins podem atualizar qualquer perfil
CREATE POLICY "Admins atualizam qualquer perfil"
ON public.profiles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Garantir que a tabela tem RLS habilitado
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Bloquear completamente acesso anônimo (não autenticado)
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;