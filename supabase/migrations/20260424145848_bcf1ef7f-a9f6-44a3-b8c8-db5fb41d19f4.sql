ALTER TABLE public.fiscal_settings
  DROP COLUMN IF EXISTS nfe_api_key,
  DROP COLUMN IF EXISTS tga_password,
  DROP COLUMN IF EXISTS tga_username;