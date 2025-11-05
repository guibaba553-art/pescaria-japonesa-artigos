-- Tabela para configurações fiscais
CREATE TABLE IF NOT EXISTS public.fiscal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nfe_enabled boolean NOT NULL DEFAULT false,
  nfe_api_key text,
  nfe_company_id text,
  tga_enabled boolean NOT NULL DEFAULT false,
  tga_api_url text,
  tga_username text,
  tga_password text,
  auto_emit_nfe boolean NOT NULL DEFAULT false,
  auto_sync_tga boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela para registro de notas fiscais emitidas
CREATE TABLE IF NOT EXISTS public.nfe_emissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  nfe_number text,
  nfe_key text,
  nfe_xml_url text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  emitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela para logs de sincronização TGA
CREATE TABLE IF NOT EXISTS public.tga_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  sync_type text NOT NULL,
  status text NOT NULL,
  request_data jsonb,
  response_data jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.fiscal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfe_emissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tga_sync_log ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver e editar configurações fiscais
CREATE POLICY "Admins podem ver configurações fiscais"
ON public.fiscal_settings FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem atualizar configurações fiscais"
ON public.fiscal_settings FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem inserir configurações fiscais"
ON public.fiscal_settings FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins e employees podem ver NF-es
CREATE POLICY "Admins e employees podem ver NF-es"
ON public.nfe_emissions FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

-- Apenas sistema pode inserir NF-es
CREATE POLICY "Sistema pode inserir NF-es"
ON public.nfe_emissions FOR INSERT
WITH CHECK (true);

-- Admins podem ver logs de sincronização
CREATE POLICY "Admins podem ver logs TGA"
ON public.tga_sync_log FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Triggers para updated_at
CREATE TRIGGER update_fiscal_settings_updated_at
BEFORE UPDATE ON public.fiscal_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_nfe_emissions_updated_at
BEFORE UPDATE ON public.nfe_emissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Inserir registro inicial de configurações
INSERT INTO public.fiscal_settings (id, nfe_enabled, tga_enabled, auto_emit_nfe, auto_sync_tga)
VALUES (gen_random_uuid(), false, false, false, false)
ON CONFLICT DO NOTHING;