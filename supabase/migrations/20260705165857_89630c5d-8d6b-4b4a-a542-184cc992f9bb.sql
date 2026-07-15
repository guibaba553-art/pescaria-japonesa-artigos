-- ============================================
-- MARCAS (BRANDS)
-- ============================================
CREATE TABLE public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_brands_name ON public.brands(name);

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados podem ver marcas"
  ON public.brands FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins e funcionarios podem criar marcas"
  ON public.brands FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins e funcionarios podem atualizar marcas"
  ON public.brands FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins podem deletar marcas"
  ON public.brands FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_brands_updated_at
  BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- BACKFILL: migrar valores distintos de products.brand para brands
-- ============================================
INSERT INTO public.brands (name)
SELECT DISTINCT brand
FROM public.products
WHERE brand IS NOT NULL AND brand != ''
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- MIGRAR products.brand TEXT → brand_id FK
-- ============================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL;

UPDATE public.products
SET brand_id = b.id
FROM public.brands b
WHERE public.products.brand IS NOT NULL
  AND public.products.brand = b.name;

ALTER TABLE public.products DROP COLUMN IF EXISTS brand;

CREATE INDEX IF NOT EXISTS idx_products_brand_id
  ON public.products(brand_id) WHERE brand_id IS NOT NULL;
