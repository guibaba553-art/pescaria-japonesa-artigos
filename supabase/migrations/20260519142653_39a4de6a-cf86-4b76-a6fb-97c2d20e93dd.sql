-- Enforce singleton config tables: at most 1 row each
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_settings_singleton
  ON public.fiscal_settings ((true));

CREATE UNIQUE INDEX IF NOT EXISTS company_fiscal_data_singleton
  ON public.company_fiscal_data ((true));

COMMENT ON TABLE public.fiscal_settings IS 'Singleton: feature flags fiscais (NFe/TGA enable, auto-emit). Apenas 1 linha permitida.';
COMMENT ON TABLE public.company_fiscal_data IS 'Singleton: dados cadastrais da empresa emissora (CNPJ, IE, endereço). Apenas 1 linha permitida.';