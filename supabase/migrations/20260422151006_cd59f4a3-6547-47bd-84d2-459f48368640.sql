-- 1. Dados fiscais da empresa emissora
CREATE TABLE public.company_fiscal_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cnpj TEXT NOT NULL,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  inscricao_estadual TEXT NOT NULL,
  inscricao_municipal TEXT,
  regime_tributario TEXT NOT NULL DEFAULT 'simples_nacional', -- simples_nacional | lucro_presumido | lucro_real
  cnae_principal TEXT,
  cep TEXT NOT NULL,
  logradouro TEXT NOT NULL,
  numero TEXT NOT NULL,
  complemento TEXT,
  bairro TEXT NOT NULL,
  municipio TEXT NOT NULL,
  codigo_municipio TEXT, -- código IBGE
  uf TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.company_fiscal_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver dados fiscais"
  ON public.company_fiscal_data FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem inserir dados fiscais"
  ON public.company_fiscal_data FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem atualizar dados fiscais"
  ON public.company_fiscal_data FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_company_fiscal_data_updated_at
  BEFORE UPDATE ON public.company_fiscal_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2. Configurações Focus NFe
CREATE TABLE public.focus_nfe_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  ambiente TEXT NOT NULL DEFAULT 'homologacao', -- homologacao | producao
  -- Defaults para Simples Nacional
  csosn_padrao TEXT NOT NULL DEFAULT '102', -- 102 = Tributada sem permissão de crédito
  cfop_padrao TEXT NOT NULL DEFAULT '5102', -- 5102 = venda dentro do estado
  cfop_interestadual TEXT NOT NULL DEFAULT '6102',
  origem_padrao TEXT NOT NULL DEFAULT '0', -- 0 = Nacional
  unidade_padrao TEXT NOT NULL DEFAULT 'UN',
  ncm_padrao TEXT, -- ex: 95079000 para artigos de pesca
  -- Emissão automática
  auto_emit_nfce_pdv BOOLEAN NOT NULL DEFAULT false,
  auto_emit_nfe_pedido_pago BOOLEAN NOT NULL DEFAULT false,
  -- NFC-e específico
  csc_id TEXT, -- ID do Código de Segurança do Contribuinte
  csc_token TEXT, -- Token CSC (NFC-e)
  serie_nfe INTEGER NOT NULL DEFAULT 1,
  serie_nfce INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.focus_nfe_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver configurações Focus NFe"
  ON public.focus_nfe_settings FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem inserir configurações Focus NFe"
  ON public.focus_nfe_settings FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem atualizar configurações Focus NFe"
  ON public.focus_nfe_settings FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_focus_nfe_settings_updated_at
  BEFORE UPDATE ON public.focus_nfe_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3. Campos fiscais por produto
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ncm TEXT,
  ADD COLUMN IF NOT EXISTS cfop TEXT,
  ADD COLUMN IF NOT EXISTS csosn TEXT,
  ADD COLUMN IF NOT EXISTS cest TEXT,
  ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT '0',
  ADD COLUMN IF NOT EXISTS unidade_comercial TEXT DEFAULT 'UN';

-- 4. Campos extras em nfe_emissions
ALTER TABLE public.nfe_emissions
  ADD COLUMN IF NOT EXISTS modelo TEXT NOT NULL DEFAULT '55', -- 55 NF-e | 65 NFC-e
  ADD COLUMN IF NOT EXISTS ambiente TEXT NOT NULL DEFAULT 'homologacao',
  ADD COLUMN IF NOT EXISTS danfe_url TEXT,
  ADD COLUMN IF NOT EXISTS ref_focus TEXT, -- referência única enviada à Focus NFe
  ADD COLUMN IF NOT EXISTS protocolo TEXT,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valor_total NUMERIC(10,2);

CREATE INDEX IF NOT EXISTS idx_nfe_emissions_ref_focus ON public.nfe_emissions(ref_focus);
CREATE INDEX IF NOT EXISTS idx_nfe_emissions_modelo ON public.nfe_emissions(modelo);