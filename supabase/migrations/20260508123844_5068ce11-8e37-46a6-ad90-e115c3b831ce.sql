UPDATE public.nfe_emissions
SET status = 'error',
    error_message = 'Rejeição 539: Duplicidade de NF-e nº 12. Próximo número avançado para 20. Reemita pelo painel.',
    updated_at = now()
WHERE id = 'eea29bd0-32f4-4809-b0ea-a8c842db46db';