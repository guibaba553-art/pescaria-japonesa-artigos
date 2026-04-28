-- 1) Explicitly revoke SELECT on sensitive product columns from anon/authenticated
-- (cost was already implicitly excluded from column grants; add explicit revoke as defense-in-depth)
REVOKE SELECT (cost) ON public.products FROM anon, authenticated;

-- 2) Add INSERT/UPDATE policies on tga_sync_log so service role and admins/employees can write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='tga_sync_log' AND policyname='Service role e admins inserem logs TGA'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Service role e admins inserem logs TGA"
      ON public.tga_sync_log
      FOR INSERT
      TO public
      WITH CHECK (
        auth.role() = 'service_role'
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'employee'::app_role)
      );
    $p$;
  END IF;
END$$;