
UPDATE public.products p
SET ncm = COALESCE(
  NULLIF(REGEXP_REPLACE(COALESCE((SELECT cfd.ncm FROM public.category_fiscal_defaults cfd WHERE cfd.category = p.category LIMIT 1),''),'\D','','g'),''),
  CASE
    WHEN p.category ILIKE '%vara%' THEN '95071000'
    WHEN p.category ILIKE '%molinete%' OR p.category ILIKE '%carretilha%' THEN '95073000'
    WHEN p.category ILIKE '%anzol%' THEN '95072000'
    ELSE '95079000'
  END
)
WHERE ncm IS NULL OR LENGTH(REGEXP_REPLACE(ncm,'\D','','g')) != 8;
