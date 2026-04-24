-- Tornar CPF opcional e adicionar CNPJ opcional na tabela customers
ALTER TABLE public.customers
  ALTER COLUMN cpf DROP NOT NULL;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS company_name text;

-- Garantir que pelo menos um documento (CPF ou CNPJ) esteja preenchido
ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_doc_required;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_doc_required
  CHECK (
    (cpf IS NOT NULL AND length(trim(cpf)) > 0)
    OR (cnpj IS NOT NULL AND length(trim(cnpj)) > 0)
  );