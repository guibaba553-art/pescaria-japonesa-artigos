-- Tabela de configurações da empresa para uso em comprovantes e documentos oficiais.

CREATE TABLE IF NOT EXISTS public.company_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Admins e employees podem ler
CREATE POLICY "Admins e employees leem company_settings" ON public.company_settings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

-- Service role gerencia
CREATE POLICY "Service role gerencia company_settings" ON public.company_settings
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

-- Valores padrão
INSERT INTO public.company_settings (key, value) VALUES
  ('logo_url', ''),
  ('legal_name', 'JapasPesca Comércio de Alimentos Ltda'),
  ('cnpj', '00.000.000/0001-00'),
  ('address', 'Rua Exemplo, 123 — Bairro — Cidade/SP — CEP 00000-000'),
  ('email', 'sac@japaspesca.com.br'),
  ('phone', '(11) 0000-0000')
ON CONFLICT (key) DO NOTHING;
