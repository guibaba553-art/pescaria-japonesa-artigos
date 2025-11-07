-- Criar tabela de configurações da loja
CREATE TABLE public.store_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_name text NOT NULL DEFAULT 'Minha Loja',
  store_logo_url text,
  store_description text,
  contact_phone text,
  contact_email text,
  contact_whatsapp text,
  primary_color text DEFAULT '222.2 84% 4.9%',
  secondary_color text DEFAULT '210 40% 96.1%',
  accent_color text DEFAULT '210 40% 96.1%',
  hero_image_url text,
  hero_title text DEFAULT 'Bem-vindo à nossa loja',
  hero_subtitle text,
  footer_text text,
  cep_origin text DEFAULT '78556100',
  mercado_pago_public_key text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Todos podem ver configurações da loja"
  ON public.store_settings
  FOR SELECT
  USING (true);

CREATE POLICY "Admins podem atualizar configurações"
  ON public.store_settings
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem inserir configurações"
  ON public.store_settings
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Inserir configuração padrão baseada nos valores atuais
INSERT INTO public.store_settings (
  store_name,
  store_description,
  contact_phone,
  contact_email,
  contact_whatsapp,
  cep_origin,
  mercado_pago_public_key,
  hero_title,
  hero_subtitle,
  footer_text
) VALUES (
  'JAPAS Pesca',
  'Tudo para sua pesca esportiva',
  '5566996579671',
  'robertobaba2@gmail.com',
  'https://wa.me/5566996579671',
  '78556100',
  'APP_USR-e5c56f4f-38de-4133-a073-2fac9c458485',
  'Equipamentos de Pesca de Qualidade',
  'Os melhores produtos para sua pescaria',
  '© 2024 JAPAS Pesca. Todos os direitos reservados.'
);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_store_settings_updated_at
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();