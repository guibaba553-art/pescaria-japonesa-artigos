ALTER TABLE public.focus_nfe_settings
ADD COLUMN IF NOT EXISTS proximo_numero_nfce integer NOT NULL DEFAULT 1;

UPDATE public.focus_nfe_settings f
SET proximo_numero_nfce = GREATEST(
  f.proximo_numero_nfce,
  COALESCE((
    SELECT MAX(NULLIF(ne.nfe_number, '')::integer) + 1
    FROM public.nfe_emissions ne
    WHERE ne.modelo = '65'
      AND ne.nfe_number ~ '^[0-9]+$'
  ), 2)
)
WHERE TRUE;