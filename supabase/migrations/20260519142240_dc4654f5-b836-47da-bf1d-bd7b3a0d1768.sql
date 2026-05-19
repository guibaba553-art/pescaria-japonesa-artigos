
-- 1) Novos campos estruturados em orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_recipient_name text,
  ADD COLUMN IF NOT EXISTS shipping_recipient_phone text,
  ADD COLUMN IF NOT EXISTS shipping_street text,
  ADD COLUMN IF NOT EXISTS shipping_number text,
  ADD COLUMN IF NOT EXISTS shipping_complement text,
  ADD COLUMN IF NOT EXISTS shipping_neighborhood text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_uf text,
  ADD COLUMN IF NOT EXISTS shipping_ibge text;

-- 2) Backfill via user_addresses (match por user_id + cep) usando o endereço default,
-- ou o mais recente se não houver default.
WITH addr AS (
  SELECT DISTINCT ON (ua.user_id, regexp_replace(ua.cep, '\D','','g'))
    ua.user_id,
    regexp_replace(ua.cep, '\D','','g') AS cep_clean,
    ua.recipient_name, ua.recipient_phone, ua.street, ua.number,
    ua.complement, ua.neighborhood, ua.city, ua.state
  FROM public.user_addresses ua
  ORDER BY ua.user_id, regexp_replace(ua.cep, '\D','','g'),
           ua.is_default DESC, ua.updated_at DESC
)
UPDATE public.orders o
SET
  shipping_recipient_name  = COALESCE(o.shipping_recipient_name,  a.recipient_name),
  shipping_recipient_phone = COALESCE(o.shipping_recipient_phone, a.recipient_phone),
  shipping_street          = COALESCE(o.shipping_street,          a.street),
  shipping_number          = COALESCE(o.shipping_number,          a.number),
  shipping_complement      = COALESCE(o.shipping_complement,      a.complement),
  shipping_neighborhood    = COALESCE(o.shipping_neighborhood,    a.neighborhood),
  shipping_city            = COALESCE(o.shipping_city,            a.city),
  shipping_uf              = COALESCE(o.shipping_uf,              a.state)
FROM addr a
WHERE a.user_id = o.user_id
  AND a.cep_clean = regexp_replace(COALESCE(o.shipping_cep,''), '\D','','g')
  AND o.shipping_street IS NULL
  AND o.delivery_type = 'delivery';
