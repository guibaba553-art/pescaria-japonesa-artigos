# Product Search Improvement — Design Spec

**Date:** 2026-07-28
**Status:** Approved

## Problem

The main e-commerce search (`SearchSection.tsx`) and the product listing filter (`ProductListing.tsx`) only search the `name` field using a simple `ilike('%query%')`. Users searching by part of a product name, SKU, brand, description, or with minor typos often get zero results.

## Goal

Multi-field search with fuzzy (typo-tolerant) matching across all relevant product fields.

## Database

### Extensions

Two PostgreSQL extensions must be enabled:

- `pg_trgm` — trigram similarity (`similarity()`, `word_similarity()`) and GIN index support for `ilike '%query%'`
- `unaccent` — accent-insensitive matching (e.g., "varao" finds "varão")

### GIN Indexes

```sql
-- products table
CREATE INDEX idx_products_search_trgm ON products
USING gin (
  name gin_trgm_ops,
  description gin_trgm_ops,
  short_description gin_trgm_ops,
  sku gin_trgm_ops,
  subcategory gin_trgm_ops,
  pound_test gin_trgm_ops,
  size gin_trgm_ops
);

-- product_variations table
CREATE INDEX idx_variations_search_trgm ON product_variations
USING gin (
  name gin_trgm_ops,
  sku gin_trgm_ops
);
```

### RPC Function: `search_products`

Signature:
```sql
search_products(
  search_query text,
  category_filter text DEFAULT NULL
) RETURNS TABLE(id uuid, score real)
```

**Logic:**

1. If `search_query` has 3+ characters → use `word_similarity()` (trigram fuzzy) across all searchable fields
2. Always also run `ilike('%query%')` as fallback for shorter queries or exact substring matches
3. Apply `unaccent()` to both the query and the indexed columns for accent-insensitive matching
4. Join `brands` table for brand name search
5. Left join `product_variations` for variation name/sku search
6. Filter: `pdv_only = false`, `stock > 0`
7. Filter by `category_filter` if provided
8. Deduplicate with `DISTINCT ON (products.id)`
9. Order by `score DESC`
10. Return `(id, score)` pairs

**Searched fields:** `products.name`, `products.description`, `products.short_description`, `products.sku`, `products.subcategory`, `products.pound_test`, `products.size`, `brands.name`, `product_variations.name`, `product_variations.sku`

## Frontend

### `SearchSection.tsx` (home page main search)

**Changes:**

1. Replace direct `supabase.from('products').select(...).ilike('name', ...)` with:
   - Call `supabase.rpc('search_products', { search_query, category_filter })` → returns ranked IDs
   - Then fetch full product details via `.from('products').select(...).in('id', ids)` reordered by rank

2. Result limit: 6 → 12

3. Placeholder text: "Digite o nome do produto..." → "Buscar por nome, marca, descrição..."

4. Fallback: if RPC call fails (e.g., migration not yet deployed), catch the error and fall back to the existing `ilike('name', ...)` query to avoid breaking the UI

5. Debounce: keep 300ms

6. Loading state: show "Buscando..." skeleton while RPC resolves

### `ProductListing.tsx` (products page filter)

**Changes:**

The client-side filter at line 199 currently only checks `p.name.toLowerCase().includes(q)`. Expand to:

```ts
const hay = [
  p.name,
  p.description,
  p.short_description ?? '',
  p.sku ?? '',
  p.brand ?? '',
  p.subcategory ?? '',
].join(' ').toLowerCase();
return hay.includes(q);
```

No other changes — the page already loads all products client-side, so no new queries needed for this view.

## Edge Cases & Error Handling

| Scenario | Behavior |
|----------|----------|
| Empty query, no category | RPC returns empty array, no error |
| Query < 3 chars | RPC uses `ilike` only (trigram requires 3+ chars) |
| RPC not found (migration pending) | Frontend catches error, falls back to old `ilike('name', ...)` |
| Network error | Try/catch → show empty state with friendly message |
| No results | "Nenhum produto encontrado. Tente buscar com outros termos." |
| Duplicate products (via variation match) | `DISTINCT ON (products.id)` in RPC |
| Accented vs non-accented | `unaccent()` normalizes both sides |

## Performance

- GIN indexes on trigrams make `ilike` and similarity queries fast even with thousands of products
- Debounce (300ms) prevents excessive DB calls
- Result limit (12) keeps payload small
- RPC runs entirely in the database — no client-side processing of the full catalog

## Testing

### Frontend (Vitest) — `src/components/__tests__/SearchSection.test.tsx`

- Renders search bar with updated placeholder
- RPC returns products → displays result cards
- RPC returns empty → shows "Nenhum produto encontrado"
- RPC fails → falls back to old `ilike` query
- Network error → empty state, no crash
- Category filter passes `category_filter` param
- Clear search button resets state
- Debounce: no RPC call before 300ms
- Click product → navigates to `/produto/:id`
- "Ver todos" link → navigates to `/produtos`

### Frontend (Vitest) — `src/lib/__tests__/productSearchFallback.test.ts`

- Fallback `ilike` returns products by name
- Excludes `pdv_only` and zero-stock products
- Maintains alphabetical ordering

### Edge Functions (Deno) — `supabase/functions/tests/search_products_test.ts`

- Exact match returns product at top
- Typo match returns product (fuzzy)
- 1–2 char query returns via `ilike`
- Category filter works
- `pdv_only` products excluded
- Zero-stock products excluded
- Accented vs non-accented works (unaccent)
- Variation SKU returns parent product
- Brand search returns matching products

## Files Changed

| File | Action |
|------|--------|
| `supabase/migrations/*.sql` | New migration: extensions + indexes + RPC (auto-generated) |
| `src/components/SearchSection.tsx` | Replace query with RPC call + fallback |
| `src/components/ProductListing.tsx` | Expand client-side filter to multiple fields |
| `src/components/__tests__/SearchSection.test.tsx` | New test file |
| `src/lib/__tests__/productSearchFallback.test.ts` | New test file |
| `supabase/functions/tests/search_products_test.ts` | New test file |
