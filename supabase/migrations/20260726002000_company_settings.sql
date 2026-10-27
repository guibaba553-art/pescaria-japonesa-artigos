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

-- Permitir leitura pública (Footer, site)
CREATE POLICY "Leitura pública de company_settings" ON public.company_settings
  FOR SELECT
  USING (true);

-- Valores padrão
INSERT INTO public.company_settings (key, value) VALUES
  ('logo_url', ''),
  ('trade_name', 'Japas Pesca'),
  ('legal_name', 'G. SEITI GARCIA BABA LTDA'),
  ('cnpj', '33.169.502/0001-08'),
  ('ie', '13.900.915-9'),
  ('cep', '78556100'),
  ('street', 'Av. das Itaúbas'),
  ('number', '2281'),
  ('complement', ''),
  ('neighborhood', 'Jardim Paraíso'),
  ('city', 'Sinop'),
  ('state', 'MT'),
  ('phone', '(66) 99921-1712'),
  ('whatsapp', '5566999211712'),
  ('email', 'robertobaba2@gmail.com'),
  ('instagram_url', 'https://www.instagram.com/japafishing_/?hl=en')
ON CONFLICT (key) DO NOTHING;
