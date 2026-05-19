
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_doc_required;

CREATE OR REPLACE FUNCTION public.sync_profile_to_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
  profile_cpf text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.id;
  profile_cpf := NULLIF(NEW.cpf, '');
  IF profile_cpf IS NOT NULL AND EXISTS (SELECT 1 FROM public.customers WHERE cpf = profile_cpf AND id <> NEW.id) THEN
    profile_cpf := NULL;
  END IF;

  INSERT INTO public.customers (
    id, full_name, cpf, email, cep, street, number, neighborhood, created_at, updated_at
  ) VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.full_name, ''), user_email, 'Cliente'),
    profile_cpf,
    user_email,
    COALESCE(NULLIF(NEW.cep, ''), ''),
    '', '', '',
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.customers.full_name),
    cpf = COALESCE(public.customers.cpf, EXCLUDED.cpf),
    email = COALESCE(EXCLUDED.email, public.customers.email),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_to_customer_trg ON public.profiles;
CREATE TRIGGER sync_profile_to_customer_trg
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_to_customer();

WITH ranked AS (
  SELECT
    p.id, p.full_name, p.cpf, p.cep, p.created_at, u.email,
    ROW_NUMBER() OVER (PARTITION BY NULLIF(p.cpf, '') ORDER BY p.created_at) AS rn
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
)
INSERT INTO public.customers (
  id, full_name, cpf, email, cep, street, number, neighborhood, created_at, updated_at
)
SELECT
  r.id,
  COALESCE(NULLIF(r.full_name, ''), r.email, 'Cliente'),
  CASE
    WHEN NULLIF(r.cpf, '') IS NULL THEN NULL
    WHEN EXISTS (SELECT 1 FROM public.customers c WHERE c.cpf = r.cpf) THEN NULL
    WHEN r.rn > 1 THEN NULL
    ELSE r.cpf
  END,
  r.email,
  COALESCE(NULLIF(r.cep, ''), ''),
  '', '', '',
  COALESCE(r.created_at, now()),
  now()
FROM ranked r
ON CONFLICT (id) DO NOTHING;
