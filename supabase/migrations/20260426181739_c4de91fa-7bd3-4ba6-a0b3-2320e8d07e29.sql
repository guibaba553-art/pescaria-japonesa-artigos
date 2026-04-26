DELETE FROM public.stock_movements WHERE product_id IN (SELECT id FROM public.products WHERE category IN ('Pendente Revisão', 'Rascunho - Migração'));
DELETE FROM public.product_label_pending WHERE product_id IN (SELECT id FROM public.products WHERE category IN ('Pendente Revisão', 'Rascunho - Migração'));
DELETE FROM public.products WHERE category IN ('Pendente Revisão', 'Rascunho - Migração');