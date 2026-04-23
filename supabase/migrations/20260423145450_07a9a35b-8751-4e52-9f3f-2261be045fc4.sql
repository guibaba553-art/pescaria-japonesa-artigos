-- 1. Restrict has_role to caller's own uid to prevent role enumeration
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only allow checking the calling user's own roles, unless called by service_role
  IF auth.uid() IS NOT NULL AND _user_id <> auth.uid() AND auth.role() <> 'service_role' THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$function$;

-- 2. Add admin DELETE policies for cash_registers and cash_movements
CREATE POLICY "Admins podem deletar caixas"
  ON public.cash_registers
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem deletar movimentações"
  ON public.cash_movements
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. Restrict realtime subscriptions: only admins/employees or order owners
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can subscribe to authorized channels" ON realtime.messages;
CREATE POLICY "Authenticated users can subscribe to authorized channels"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'employee'::app_role)
  );

-- 4. Restrict listing of public product-images bucket
DROP POLICY IF EXISTS "Public can list product images" ON storage.objects;

CREATE POLICY "Admins can list product images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'employee'::app_role)
    )
  );