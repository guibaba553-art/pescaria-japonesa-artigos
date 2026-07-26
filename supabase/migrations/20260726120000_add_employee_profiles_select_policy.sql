-- Fix: Add policy allowing employees to view all profiles.
-- The profiles SELECT RLS only allows admins to see all profiles,
-- but employees with 'orders' permission need to see customer names
-- in the OrdersManagement component at /admin/pedidos.
-- Without this, customer names stay as "Carregando..." forever for
-- non-admin employees because RLS silently filters out all profiles
-- except their own.

-- Ensure no duplicate policy name
DROP POLICY IF EXISTS "Funcionários veem todos os perfis" ON public.profiles;

CREATE POLICY "Funcionários veem todos os perfis"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'employee'::app_role));
