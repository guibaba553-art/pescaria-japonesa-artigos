-- Adicionar campos obrigatórios na tabela profiles
ALTER TABLE public.profiles
ADD COLUMN cep TEXT,
ADD COLUMN cpf TEXT,
ADD COLUMN phone TEXT;

-- Adicionar constraints de validação
ALTER TABLE public.profiles
ADD CONSTRAINT cpf_format_check CHECK (cpf ~ '^\d{11}$'),
ADD CONSTRAINT cep_format_check CHECK (cep ~ '^\d{8}$'),
ADD CONSTRAINT phone_format_check CHECK (phone ~ '^\d{10,11}$');