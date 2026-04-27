-- 1) Tabela de padrões fiscais por categoria
CREATE TABLE IF NOT EXISTS public.category_fiscal_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL UNIQUE,
  ncm TEXT,
  cest TEXT,
  cfop TEXT DEFAULT '5102',
  csosn TEXT DEFAULT '102',
  origem TEXT DEFAULT '0',
  unidade_comercial TEXT DEFAULT 'UN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.category_fiscal_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos podem ver padroes fiscais"
  ON public.category_fiscal_defaults FOR SELECT
  USING (true);

CREATE POLICY "Admins gerenciam padroes fiscais"
  ON public.category_fiscal_defaults FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_category_fiscal_defaults_updated
  BEFORE UPDATE ON public.category_fiscal_defaults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2) Padrões iniciais para artigos de pesca
INSERT INTO public.category_fiscal_defaults (category, ncm, cfop, csosn, origem, unidade_comercial) VALUES
  ('Varas',                   '95071000', '5102', '102', '0', 'UN'),
  ('Molinetes e Carretilhas', '95073000', '5102', '102', '0', 'UN'),
  ('Iscas',                   '95079000', '5102', '102', '0', 'UN'),
  ('Anzóis',                  '95072000', '5102', '102', '0', 'UN'),
  ('Linhas',                  '95079000', '5102', '102', '0', 'UN'),
  ('Acessórios',              '95079000', '5102', '102', '0', 'UN'),
  ('Roupas',                  '62019000', '5102', '102', '0', 'UN'),
  ('Variedades',              '95079000', '5102', '102', '0', 'UN')
ON CONFLICT (category) DO NOTHING;

-- 3) Extrair UF do endereço de entrega
-- O endereço é gravado como texto livre; tentamos achar uma sigla de UF no final
CREATE OR REPLACE FUNCTION public.extract_uf_from_address(p_address TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_uf TEXT;
BEGIN
  IF p_address IS NULL THEN RETURN NULL; END IF;
  -- Procura por sigla UF: 2 letras maiúsculas isoladas (ex.: ", MT", " - SP", " RJ ", etc.)
  SELECT (regexp_matches(upper(p_address), '\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b', 'g'))[1]
    INTO v_uf;
  RETURN v_uf;
END;
$$;

-- 4) Decide CFOP por UF de destino vs UF de origem (MT)
CREATE OR REPLACE FUNCTION public.get_cfop_by_uf(
  p_uf_destino TEXT,
  p_has_st BOOLEAN DEFAULT FALSE
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_uf_origem CONSTANT TEXT := 'MT';
BEGIN
  IF p_uf_destino IS NULL OR upper(p_uf_destino) = v_uf_origem THEN
    -- Dentro do estado
    RETURN CASE WHEN p_has_st THEN '5405' ELSE '5102' END;
  ELSE
    -- Interestadual a consumidor final não-contribuinte
    RETURN CASE WHEN p_has_st THEN '6404' ELSE '6108' END;
  END IF;
END;
$$;

-- 5) Validar campos fiscais de itens de um pedido antes da emissão
CREATE OR REPLACE FUNCTION public.validate_order_fiscal(p_order_id UUID)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  missing_fields TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN p.ncm IS NULL OR btrim(p.ncm) = '' THEN 'NCM' END,
      CASE WHEN p.csosn IS NULL OR btrim(p.csosn) = '' THEN 'CSOSN' END,
      CASE WHEN p.origem IS NULL OR btrim(p.origem) = '' THEN 'Origem' END,
      CASE WHEN p.unidade_comercial IS NULL OR btrim(p.unidade_comercial) = '' THEN 'Unidade' END
    ], NULL) AS missing_fields
  FROM public.order_items oi
  JOIN public.products p ON p.id = oi.product_id
  WHERE oi.order_id = p_order_id
    AND p.include_in_nfe = true
    AND (
      p.ncm IS NULL OR btrim(p.ncm) = '' OR
      p.csosn IS NULL OR btrim(p.csosn) = '' OR
      p.origem IS NULL OR btrim(p.origem) = '' OR
      p.unidade_comercial IS NULL OR btrim(p.unidade_comercial) = ''
    );
END;
$$;