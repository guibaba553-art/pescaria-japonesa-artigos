-- Permitir que todos admins/employees vejam, atualizem e excluam vendas salvas (compartilhamento entre operadores)
-- Substituir políticas restritivas dos employees

DROP POLICY IF EXISTS "Funcionarios atualizam suas vendas salvas" ON public.saved_sales;
DROP POLICY IF EXISTS "Funcionarios deletam suas vendas salvas" ON public.saved_sales;
DROP POLICY IF EXISTS "Funcionarios veem suas vendas salvas" ON public.saved_sales;

-- Funcionários veem TODAS as vendas salvas (compartilhado com a equipe)
CREATE POLICY "Funcionarios veem todas vendas salvas"
ON public.saved_sales
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'employee'::app_role));

-- Funcionários podem atualizar qualquer venda salva (assumir venda de colega)
CREATE POLICY "Funcionarios atualizam qualquer venda salva"
ON public.saved_sales
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'employee'::app_role))
WITH CHECK (has_role(auth.uid(), 'employee'::app_role));

-- Funcionários podem deletar qualquer venda salva (finalizar/descartar)
CREATE POLICY "Funcionarios deletam qualquer venda salva"
ON public.saved_sales
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'employee'::app_role));

-- Política de INSERT permanece a mesma (cada um cria com seu próprio user_id)
-- Mas precisamos relaxar para permitir que ela seja vista corretamente
-- (a política existente "Funcionarios criam suas vendas salvas" já está OK)

-- Adicionar índice para ordenação por data
CREATE INDEX IF NOT EXISTS idx_saved_sales_created_at ON public.saved_sales (created_at DESC);