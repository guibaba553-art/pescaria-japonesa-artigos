-- Permitir que admins atualizem nfe_emissions (necessário para destravar notas presas)
CREATE POLICY "Admins podem atualizar NF-es"
ON public.nfe_emissions
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Corrigir a nota presa em pending (rejeitada por SEFAZ 539)
UPDATE public.nfe_emissions
SET status = 'error',
    error_message = '[SEFAZ 539] Duplicidade de NF-e com diferenca na Chave de Acesso',
    updated_at = now()
WHERE id = 'dc998f3f-a37d-4320-b456-761550818be9'
  AND status = 'pending';