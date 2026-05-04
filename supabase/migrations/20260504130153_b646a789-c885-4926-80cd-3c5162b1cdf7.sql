CREATE TABLE public.dismissed_stock_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL UNIQUE,
  dismissed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.dismissed_stock_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/employee can view dismissed alerts"
ON public.dismissed_stock_alerts FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admin/employee can insert dismissed alerts"
ON public.dismissed_stock_alerts FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admin/employee can delete dismissed alerts"
ON public.dismissed_stock_alerts FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.dismissed_stock_alerts;