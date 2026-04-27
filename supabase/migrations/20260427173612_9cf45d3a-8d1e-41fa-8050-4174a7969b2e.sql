CREATE OR REPLACE FUNCTION public.extract_uf_from_address(p_address TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_uf TEXT;
BEGIN
  IF p_address IS NULL THEN RETURN NULL; END IF;
  SELECT (regexp_matches(upper(p_address), '\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b', 'g'))[1]
    INTO v_uf;
  RETURN v_uf;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cfop_by_uf(
  p_uf_destino TEXT,
  p_has_st BOOLEAN DEFAULT FALSE
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_uf_origem CONSTANT TEXT := 'MT';
BEGIN
  IF p_uf_destino IS NULL OR upper(p_uf_destino) = v_uf_origem THEN
    RETURN CASE WHEN p_has_st THEN '5405' ELSE '5102' END;
  ELSE
    RETURN CASE WHEN p_has_st THEN '6404' ELSE '6108' END;
  END IF;
END;
$$;