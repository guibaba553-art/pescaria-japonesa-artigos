-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- GIN trigram index on products for fast ilike + similarity queries
CREATE INDEX IF NOT EXISTS idx_products_search_trgm ON products
USING gin (
  name gin_trgm_ops,
  description gin_trgm_ops,
  short_description gin_trgm_ops,
  sku gin_trgm_ops,
  subcategory gin_trgm_ops,
  pound_test gin_trgm_ops,
  size gin_trgm_ops
);

-- GIN trigram index on product_variations for variation name/sku search
CREATE INDEX IF NOT EXISTS idx_variations_search_trgm ON product_variations
USING gin (
  name gin_trgm_ops,
  sku gin_trgm_ops
);

-- RPC: multi-field fuzzy product search
CREATE OR REPLACE FUNCTION search_products(
  search_query text,
  category_filter text DEFAULT NULL
) RETURNS TABLE(id uuid, score real)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  query_len int;
BEGIN
  query_len := char_length(trim(search_query));

  RETURN QUERY
  WITH product_scores AS (
    SELECT DISTINCT ON (p.id)
      p.id,
      GREATEST(
        CASE WHEN query_len >= 3 THEN word_similarity(unaccent(lower(search_query)), unaccent(lower(p.name))) ELSE 0 END,
        CASE WHEN query_len >= 3 THEN word_similarity(unaccent(lower(search_query)), unaccent(lower(COALESCE(p.description, '')))) ELSE 0 END,
        CASE WHEN query_len >= 3 THEN word_similarity(unaccent(lower(search_query)), unaccent(lower(COALESCE(p.short_description, '')))) ELSE 0 END,
        CASE WHEN query_len >= 3 THEN word_similarity(unaccent(lower(search_query)), unaccent(lower(COALESCE(p.sku, '')))) ELSE 0 END,
        CASE WHEN query_len >= 3 THEN word_similarity(unaccent(lower(search_query)), unaccent(lower(COALESCE(p.subcategory, '')))) ELSE 0 END,
        CASE WHEN query_len >= 3 THEN word_similarity(unaccent(lower(search_query)), unaccent(lower(COALESCE(p.pound_test, '')))) ELSE 0 END,
        CASE WHEN query_len >= 3 THEN word_similarity(unaccent(lower(search_query)), unaccent(lower(COALESCE(p.size, '')))) ELSE 0 END,
        CASE WHEN query_len >= 3 THEN word_similarity(unaccent(lower(search_query)), unaccent(lower(COALESCE(b.name, '')))) ELSE 0 END,
        CASE WHEN query_len >= 3 THEN word_similarity(unaccent(lower(search_query)), unaccent(lower(COALESCE(pv.name, '')))) ELSE 0 END,
        CASE WHEN query_len >= 3 THEN word_similarity(unaccent(lower(search_query)), unaccent(lower(COALESCE(pv.sku, '')))) ELSE 0 END,
        CASE WHEN unaccent(lower(p.name)) LIKE '%' || unaccent(lower(search_query)) || '%' THEN 0.5 ELSE 0 END,
        CASE WHEN unaccent(lower(COALESCE(p.description, ''))) LIKE '%' || unaccent(lower(search_query)) || '%' THEN 0.4 ELSE 0 END,
        CASE WHEN unaccent(lower(COALESCE(p.short_description, ''))) LIKE '%' || unaccent(lower(search_query)) || '%' THEN 0.4 ELSE 0 END,
        CASE WHEN unaccent(lower(COALESCE(p.sku, ''))) LIKE '%' || unaccent(lower(search_query)) || '%' THEN 0.6 ELSE 0 END,
        CASE WHEN unaccent(lower(COALESCE(p.subcategory, ''))) LIKE '%' || unaccent(lower(search_query)) || '%' THEN 0.3 ELSE 0 END,
        CASE WHEN unaccent(lower(COALESCE(p.pound_test, ''))) LIKE '%' || unaccent(lower(search_query)) || '%' THEN 0.3 ELSE 0 END,
        CASE WHEN unaccent(lower(COALESCE(p.size, ''))) LIKE '%' || unaccent(lower(search_query)) || '%' THEN 0.3 ELSE 0 END,
        CASE WHEN unaccent(lower(COALESCE(b.name, ''))) LIKE '%' || unaccent(lower(search_query)) || '%' THEN 0.4 ELSE 0 END,
        CASE WHEN unaccent(lower(COALESCE(pv.name, ''))) LIKE '%' || unaccent(lower(search_query)) || '%' THEN 0.7 ELSE 0 END,
        CASE WHEN unaccent(lower(COALESCE(pv.sku, ''))) LIKE '%' || unaccent(lower(search_query)) || '%' THEN 0.7 ELSE 0 END
      ) AS score
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN product_variations pv ON pv.product_id = p.id
    WHERE p.pdv_only = false
      AND p.stock > 0
      AND (
        search_query IS NULL
        OR trim(search_query) = ''
        OR unaccent(lower(p.name)) LIKE '%' || unaccent(lower(search_query)) || '%'
        OR unaccent(lower(COALESCE(p.description, ''))) LIKE '%' || unaccent(lower(search_query)) || '%'
        OR unaccent(lower(COALESCE(p.short_description, ''))) LIKE '%' || unaccent(lower(search_query)) || '%'
        OR unaccent(lower(COALESCE(p.sku, ''))) LIKE '%' || unaccent(lower(search_query)) || '%'
        OR unaccent(lower(COALESCE(p.subcategory, ''))) LIKE '%' || unaccent(lower(search_query)) || '%'
        OR unaccent(lower(COALESCE(p.pound_test, ''))) LIKE '%' || unaccent(lower(search_query)) || '%'
        OR unaccent(lower(COALESCE(p.size, ''))) LIKE '%' || unaccent(lower(search_query)) || '%'
        OR unaccent(lower(COALESCE(b.name, ''))) LIKE '%' || unaccent(lower(search_query)) || '%'
        OR unaccent(lower(COALESCE(pv.name, ''))) LIKE '%' || unaccent(lower(search_query)) || '%'
        OR unaccent(lower(COALESCE(pv.sku, ''))) LIKE '%' || unaccent(lower(search_query)) || '%'
      )
      AND (category_filter IS NULL OR p.category = category_filter)
  )
  SELECT ps.id, ps.score
  FROM product_scores ps
  WHERE ps.score > 0
  ORDER BY ps.score DESC
  LIMIT 50;
END;
$$;
