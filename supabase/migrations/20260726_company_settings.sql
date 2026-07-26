CREATE TABLE IF NOT EXISTS public.company_settings (
  key   text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.company_settings (key, value) VALUES
  ('legal_name', 'JapasPesca Comércio de Alimentos Ltda'),
  ('cnpj', '00.000.000/0001-00'),
  ('cep', '78556100'),
  ('street', 'Av. das Itaúbas'),
  ('number', '2281'),
  ('complement', ''),
  ('neighborhood', 'Jardim Paraíso'),
  ('city', 'Sinop'),
  ('state', 'MT'),
  ('email', 'sac@japaspesca.com.br'),
  ('phone', '(11) 0000-0000')
ON CONFLICT (key) DO NOTHING;
