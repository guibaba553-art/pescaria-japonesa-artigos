-- 1. Garantir REPLICA IDENTITY FULL para que a RLS seja aplicada corretamente em transmissões realtime
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;

-- 2. Adicionar políticas faltantes para funcionários nos caixas
-- cash_registers: funcionários podem ver, criar e atualizar (operam o caixa diariamente)
CREATE POLICY "Funcionarios podem ver caixas"
ON public.cash_registers
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Funcionarios podem criar caixas"
ON public.cash_registers
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'employee'::app_role) AND opened_by = auth.uid());

CREATE POLICY "Funcionarios podem atualizar caixas que abriram"
ON public.cash_registers
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'employee'::app_role) AND opened_by = auth.uid());

-- cash_movements: funcionários podem ver e criar movimentações
CREATE POLICY "Funcionarios podem ver movimentacoes"
ON public.cash_movements
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Funcionarios podem criar movimentacoes"
ON public.cash_movements
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'employee'::app_role) AND performed_by = auth.uid());