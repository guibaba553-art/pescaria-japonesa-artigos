
-- Tighten RLS scope to authenticated-only roles to reduce attack surface

-- user_roles policies
DROP POLICY IF EXISTS "Admins podem ver todas as roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins podem inserir roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins podem deletar roles" ON public.user_roles;

CREATE POLICY "Admins podem ver todas as roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem inserir roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem deletar roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- fiscal_settings policies
DROP POLICY IF EXISTS "Admins podem ver configurações fiscais" ON public.fiscal_settings;
DROP POLICY IF EXISTS "Admins podem inserir configurações fiscais" ON public.fiscal_settings;
DROP POLICY IF EXISTS "Admins podem atualizar configurações fiscais" ON public.fiscal_settings;

CREATE POLICY "Admins podem ver configurações fiscais"
ON public.fiscal_settings
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem inserir configurações fiscais"
ON public.fiscal_settings
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem atualizar configurações fiscais"
ON public.fiscal_settings
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- focus_nfe_settings policies (contains csc_token)
DROP POLICY IF EXISTS "Admins podem ver configurações Focus NFe" ON public.focus_nfe_settings;
DROP POLICY IF EXISTS "Admins podem inserir configurações Focus NFe" ON public.focus_nfe_settings;
DROP POLICY IF EXISTS "Admins podem atualizar configurações Focus NFe" ON public.focus_nfe_settings;

CREATE POLICY "Admins podem ver configurações Focus NFe"
ON public.focus_nfe_settings
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem inserir configurações Focus NFe"
ON public.focus_nfe_settings
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem atualizar configurações Focus NFe"
ON public.focus_nfe_settings
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- company_fiscal_data policies (contains CNPJ, IE etc)
DROP POLICY IF EXISTS "Admins podem ver dados fiscais" ON public.company_fiscal_data;
DROP POLICY IF EXISTS "Admins podem inserir dados fiscais" ON public.company_fiscal_data;
DROP POLICY IF EXISTS "Admins podem atualizar dados fiscais" ON public.company_fiscal_data;

CREATE POLICY "Admins podem ver dados fiscais"
ON public.company_fiscal_data
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem inserir dados fiscais"
ON public.company_fiscal_data
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem atualizar dados fiscais"
ON public.company_fiscal_data
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
