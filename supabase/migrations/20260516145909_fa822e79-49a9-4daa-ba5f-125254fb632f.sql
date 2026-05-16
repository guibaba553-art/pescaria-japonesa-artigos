
-- Remove auto-troco trigger; sangria becomes manual only
DROP TRIGGER IF EXISTS trg_auto_register_troco ON public.orders;
DROP FUNCTION IF EXISTS public.auto_register_troco_on_order();

-- Limpa movimentações de troco do caixa aberto e zera sangrias
DELETE FROM public.cash_movements
WHERE cash_register_id='708938ca-1038-467b-aeaa-f652c9a75496'
  AND type='withdrawal'
  AND reason ILIKE 'Troco%';

UPDATE public.cash_registers
SET withdrawals = 0,
    expected_amount = expected_amount + 54
WHERE id='708938ca-1038-467b-aeaa-f652c9a75496';
