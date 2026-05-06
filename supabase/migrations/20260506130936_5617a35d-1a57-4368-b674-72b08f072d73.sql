
-- Tabelas de auditoria de estoque
CREATE TABLE public.stock_audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'running', -- running | success | failed
  total_skus INTEGER NOT NULL DEFAULT 0,
  ok_count INTEGER NOT NULL DEFAULT 0,
  discrepancy_count INTEGER NOT NULL DEFAULT 0,
  backup_xml_size INTEGER,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  email_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.stock_audit_discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.stock_audit_runs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  variation_id UUID,
  product_name TEXT NOT NULL,
  variation_name TEXT,
  sku TEXT,
  current_stock NUMERIC NOT NULL,
  expected_stock NUMERIC NOT NULL,
  difference NUMERIC NOT NULL,
  movements_summary JSONB,
  probable_cause TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_disc_run ON public.stock_audit_discrepancies(run_id);
CREATE INDEX idx_audit_disc_product ON public.stock_audit_discrepancies(product_id) WHERE resolved = false;
CREATE INDEX idx_audit_runs_date ON public.stock_audit_runs(run_at DESC);

ALTER TABLE public.stock_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_audit_discrepancies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/employee veem runs" ON public.stock_audit_runs FOR SELECT
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'employee'::app_role));
CREATE POLICY "Service role gerencia runs" ON public.stock_audit_runs FOR ALL
  USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');

CREATE POLICY "Admin/employee veem divergencias" ON public.stock_audit_discrepancies FOR SELECT
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'employee'::app_role));
CREATE POLICY "Admin atualiza divergencias" ON public.stock_audit_discrepancies FOR UPDATE
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Service role gerencia divergencias" ON public.stock_audit_discrepancies FOR ALL
  USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');

-- Função RPC: lista produtos com divergência ativa (para badge no catálogo)
CREATE OR REPLACE FUNCTION public.get_products_with_stock_discrepancy()
RETURNS TABLE(product_id UUID, discrepancy_count BIGINT, last_run_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.product_id, COUNT(*)::BIGINT, MAX(r.run_at)
  FROM public.stock_audit_discrepancies d
  JOIN public.stock_audit_runs r ON r.id = d.run_id
  WHERE d.resolved = false
    AND r.id = (SELECT id FROM public.stock_audit_runs WHERE status='success' ORDER BY run_at DESC LIMIT 1)
  GROUP BY d.product_id;
$$;
