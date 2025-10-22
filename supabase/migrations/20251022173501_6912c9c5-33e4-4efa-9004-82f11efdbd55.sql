-- 1. CORREÇÃO CRÍTICA: Restringir acesso à tabela profiles
-- Usuários devem ver apenas seu próprio perfil, não todos os perfis
DROP POLICY IF EXISTS "Usuários podem ver todos os perfis" ON public.profiles;

CREATE POLICY "Usuários podem ver apenas seu próprio perfil"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

-- Funcionários e admins podem ver todos os perfis para gerenciar pedidos
CREATE POLICY "Funcionários podem ver todos os perfis"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

-- 2. CORREÇÃO: Adicionar política UPDATE para chat_messages
-- Apenas funcionários podem atualizar status das mensagens
CREATE POLICY "Funcionários podem atualizar mensagens"
ON public.chat_messages
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

-- 3. CORREÇÃO: Adicionar política DELETE para chat_messages
-- Apenas admins podem deletar mensagens
CREATE POLICY "Admins podem deletar mensagens"
ON public.chat_messages
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. CORREÇÃO: Garantir que search_path está definido nas funções (usando CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;