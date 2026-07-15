DO $$
DECLARE tbl record; has_priv boolean;
BEGIN
  FOR tbl IN SELECT c.relname AS table_name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE c.relkind='r' AND n.nspname='public'
  LOOP
    SELECT EXISTS (SELECT 1 FROM information_schema.role_table_grants
      WHERE grantee='authenticated' AND table_schema='public' AND table_name=tbl.table_name
        AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')) INTO has_priv;
    IF NOT has_priv THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.table_name);
    END IF;
    SELECT EXISTS (SELECT 1 FROM information_schema.role_table_grants
      WHERE grantee='service_role' AND table_schema='public' AND table_name=tbl.table_name
        AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')) INTO has_priv;
    IF NOT has_priv THEN
      EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.table_name);
    END IF;
  END LOOP;
END; $$;

-- Tabelas com leitura pública (vitrine do site)
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.product_variations TO anon;
GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.reviews TO anon;
GRANT SELECT ON public.coupons TO anon;
GRANT SELECT ON public.customer_tiers TO anon;
GRANT SELECT ON public.brands TO anon;