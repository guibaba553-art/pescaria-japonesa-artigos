# Restringir Colunas Sensíveis em products e product_variations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restringir SELECT público em `products` e `product_variations` para expor apenas colunas seguras (name, price, stock, images, etc.), exigindo admin/employee para acessar `cost`, `price_pdv`, `supplier_id`, e demais colunas sensíveis.

**Architecture:** Nova migration SQL aplica column-level GRANTs restritivos no PostgreSQL (PostgREST os respeita). Frontend público usa listas explícitas de colunas (`PUBLIC_VARIATION_COLUMNS`). Admin usa RPCs `SECURITY DEFINER` existentes (`get_products_admin`, `get_product_variations_admin`) para ler todas as colunas. Writes (INSERT/UPDATE/DELETE) não são afetados — RLS policies já restringem por role.

**Tech Stack:** PostgreSQL GRANTs, PostgREST column-level security, React/TypeScript, Supabase client

## Global Constraints

- `min_sale_price` permanece público (define o preço exibido no site, não é custo)
- Colunas verdadeiramente sensíveis: `cost`, `price_pdv`, `price_cash_percent`, `price_pix_percent`, `price_debit_percent`, `price_credit_percent`, `supplier_id`, `created_by`, `freight_pct`, `op_cost_pct`, `tax_pct`, `cost_group_id`
- RPCs `get_products_admin()` e `get_product_variations_admin()` já existem e verificam `has_role('admin' | 'employee')`
- Writes (INSERT/UPDATE/DELETE) mantêm table-level GRANTs — RLS policies já fazem o gate
- Migrations em `supabase/migrations/` são auto-generated, mas criamos uma nova migration seguindo o padrão existente

---

### Task 1: Migration SQL — Restringir column-level GRANTs

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_restrict_public_column_access.sql`

**Interfaces:**
- Consumes: current GRANT state (full SELECT on products + product_variations for anon/authenticated)
- Produces: restricted column-level SELECT grants; new RPC `get_product_variations_by_product(uuid)`

**Safe columns for `products`** (idêntico ao `PUBLIC_PRODUCT_COLUMNS` existente):
```
id, name, description, short_description, price, category, subcategory, brand_id,
brand, size, pound_test, image_url, images, rating, stock, featured, on_sale,
sale_price, sale_ends_at, sale_limit_qty, sale_sold_qty, min_sale_price,
minimum_quantity, sku, sold_by_weight, weight_grams, length_cm, width_cm, height_cm,
created_at, updated_at, ncm, cest, csosn, cfop, origem, unidade_comercial,
include_in_nfe, min_stock, pdv_only
```

**Safe columns for `product_variations`**:
```
id, product_id, name, price, stock, sku, created_at, updated_at, description,
image_url, weight_grams, length_cm, width_cm, height_cm, min_stock,
on_sale, sale_price, sale_ends_at, sale_limit_qty, sale_sold_qty, min_sale_price
```

- [ ] **Step 1: Create migration file**

```sql
-- 1) Restrict SELECT on products — only safe columns for anon/authenticated
REVOKE SELECT ON public.products FROM anon, authenticated;

GRANT SELECT (
  id, name, description, short_description, price, category, subcategory, brand_id,
  brand, size, pound_test, image_url, images, rating, stock, featured, on_sale,
  sale_price, sale_ends_at, sale_limit_qty, sale_sold_qty, min_sale_price,
  minimum_quantity, sku, sold_by_weight, weight_grams, length_cm, width_cm, height_cm,
  created_at, updated_at, ncm, cest, csosn, cfop, origem, unidade_comercial,
  include_in_nfe, min_stock, pdv_only
) ON public.products TO anon, authenticated;

-- 2) Restrict SELECT on product_variations — only safe columns for anon/authenticated
REVOKE SELECT ON public.product_variations FROM anon, authenticated;

GRANT SELECT (
  id, product_id, name, price, stock, sku, created_at, updated_at, description,
  image_url, weight_grams, length_cm, width_cm, height_cm, min_stock,
  on_sale, sale_price, sale_ends_at, sale_limit_qty, sale_sold_qty, min_sale_price
) ON public.product_variations TO anon, authenticated;

-- 3) RPC for admin/employee to read ALL columns of variations for a specific product
CREATE OR REPLACE FUNCTION public.get_product_variations_by_product(p_product_id uuid)
RETURNS SETOF public.product_variations
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'employee'::app_role)) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  RETURN QUERY SELECT * FROM public.product_variations WHERE product_id = p_product_id ORDER BY name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_product_variations_by_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_variations_by_product(uuid) TO authenticated;
```

- [ ] **Step 2: Verify migration is consistent with PUBLIC_PRODUCT_COLUMNS**

Check that the safe columns list in the SQL migration matches the TypeScript `PUBLIC_PRODUCT_COLUMNS` constant exactly (same columns, same order doesn't matter).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/YYYYMMDDHHMMSS_restrict_public_column_access.sql
git commit -m "feat(db): restrict public SELECT on products and product_variations to safe columns"
```

---

### Task 2: productColumns.ts — Adicionar PUBLIC_VARIATION_COLUMNS e corrigir wildcard

**Files:**
- Modify: `src/utils/productColumns.ts` (lines 1-50)

**Interfaces:**
- Produces: `PUBLIC_VARIATION_COLUMNS` (string, comma-separated safe variation column names)
- Modifies: `PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS` (replace `variations:product_variations(*)` with explicit column list)

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/productColumns.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PUBLIC_PRODUCT_COLUMNS, PUBLIC_VARIATION_COLUMNS, PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS } from '../productColumns';

describe('PUBLIC_PRODUCT_COLUMNS', () => {
  const cols = PUBLIC_PRODUCT_COLUMNS.split(', ');

  it('deve incluir colunas seguras básicas', () => {
    expect(cols).toContain('id');
    expect(cols).toContain('name');
    expect(cols).toContain('price');
    expect(cols).toContain('stock');
    expect(cols).toContain('image_url');
    expect(cols).toContain('min_sale_price');
  });

  it('NÃO deve incluir colunas sensíveis de custo', () => {
    expect(cols).not.toContain('cost');
    expect(cols).not.toContain('price_pdv');
    expect(cols).not.toContain('price_cash_percent');
    expect(cols).not.toContain('price_pix_percent');
    expect(cols).not.toContain('price_debit_percent');
    expect(cols).not.toContain('price_credit_percent');
    expect(cols).not.toContain('supplier_id');
    expect(cols).not.toContain('created_by');
    expect(cols).not.toContain('freight_pct');
    expect(cols).not.toContain('op_cost_pct');
    expect(cols).not.toContain('tax_pct');
    expect(cols).not.toContain('cost_group_id');
  });
});

describe('PUBLIC_VARIATION_COLUMNS', () => {
  const cols = PUBLIC_VARIATION_COLUMNS.split(', ');

  it('deve incluir colunas seguras básicas de variação', () => {
    expect(cols).toContain('id');
    expect(cols).toContain('product_id');
    expect(cols).toContain('name');
    expect(cols).toContain('price');
    expect(cols).toContain('stock');
    expect(cols).toContain('sku');
    expect(cols).toContain('image_url');
  });

  it('NÃO deve incluir colunas sensíveis de custo', () => {
    expect(cols).not.toContain('cost');
    expect(cols).not.toContain('price_pdv');
    expect(cols).not.toContain('price_pdv_pix');
    expect(cols).not.toContain('price_pdv_cash');
    expect(cols).not.toContain('price_pdv_debit');
    expect(cols).not.toContain('price_pdv_credit');
    expect(cols).not.toContain('cost_group_id');
    expect(cols).not.toContain('freight_pct');
    expect(cols).not.toContain('op_cost_pct');
    expect(cols).not.toContain('tax_pct');
  });
});

describe('PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS', () => {
  it('NÃO deve usar wildcard (*) para variações', () => {
    expect(PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS).not.toContain('product_variations(*)');
  });

  it('deve usar PUBLIC_VARIATION_COLUMNS para variações', () => {
    expect(PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS).toContain(PUBLIC_VARIATION_COLUMNS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/utils/__tests__/productColumns.test.ts
```
Expected: FAIL — `PUBLIC_VARIATION_COLUMNS` not exported, and `product_variations(*)` still present.

- [ ] **Step 3: Implement the changes in productColumns.ts**

```ts
/**
 * Colunas SEGURAS de `products` para telas voltadas ao cliente (anon/authenticated).
 *
 * Por motivos de segurança, anon/authenticated só têm GRANT nas colunas
 * abaixo. Usar `select('*')` causa "permission denied for table products".
 * Telas administrativas (admin/employee) devem usar a RPC `get_products_admin`.
 */
export const PUBLIC_PRODUCT_COLUMNS = [
  'id',
  'name',
  'description',
  'short_description',
  'price',
  'category',
  'subcategory',
  'brand_id',
  'size',
  'pound_test',
  'image_url',
  'images',
  'rating',
  'stock',
  'featured',
  'on_sale',
  'sale_price',
  'sale_ends_at',
  'sale_limit_qty',
  'sale_sold_qty',
  'min_sale_price',
  'minimum_quantity',
  'sku',
  'sold_by_weight',
  'weight_grams',
  'length_cm',
  'width_cm',
  'height_cm',
  'created_at',
  'updated_at',
  'ncm',
  'cest',
  'csosn',
  'cfop',
  'origem',
  'unidade_comercial',
  'include_in_nfe',
].join(', ');

/**
 * Colunas SEGURAS de `product_variations` para telas voltadas ao cliente.
 *
 * Estas são as únicas colunas que anon/authenticated podem SELECT.
 * Telas administrativas que precisam de todas as colunas devem usar
 * `rpc('get_product_variations_admin')` ou `rpc('get_product_variations_by_product', { p_product_id })`.
 */
export const PUBLIC_VARIATION_COLUMNS = [
  'id',
  'product_id',
  'name',
  'price',
  'stock',
  'sku',
  'created_at',
  'updated_at',
  'description',
  'image_url',
  'weight_grams',
  'length_cm',
  'width_cm',
  'height_cm',
  'min_stock',
  'on_sale',
  'sale_price',
  'sale_ends_at',
  'sale_limit_qty',
  'sale_sold_qty',
  'min_sale_price',
].join(', ');

/** Versão com variações embutidas usando apenas colunas seguras. */
export const PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS =
  `${PUBLIC_PRODUCT_COLUMNS}, variations:product_variations(${PUBLIC_VARIATION_COLUMNS})`;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/utils/__tests__/productColumns.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/productColumns.ts src/utils/__tests__/productColumns.test.ts
git commit -m "feat: add PUBLIC_VARIATION_COLUMNS and remove wildcard from variations embed"
```

---

### Task 3: ProductDetails.tsx — Substituir select('*') nas variações

**Files:**
- Modify: `src/pages/ProductDetails.tsx` (line 95)

**Interfaces:**
- Consumes: `PUBLIC_VARIATION_COLUMNS` from `src/utils/productColumns.ts`
- Produces: safe variation query for public product detail page

- [ ] **Step 1: Write the failing test**

The test verifies that the ProductDetails page only requests safe columns for variations. Create `src/pages/__tests__/ProductDetails.test.tsx`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// We test the column list used, not the full component render
import { PUBLIC_VARIATION_COLUMNS } from '@/utils/productColumns';

describe('ProductDetails variation columns', () => {
  it('deve usar apenas colunas seguras para variações', () => {
    const cols = PUBLIC_VARIATION_COLUMNS.split(', ');
    
    // Verifica que não tem wildcard
    expect(PUBLIC_VARIATION_COLUMNS).not.toBe('*');
    
    // Verifica que colunas sensíveis não estão presentes
    expect(cols).not.toContain('cost');
    expect(cols).not.toContain('price_pdv');
    expect(cols).not.toContain('cost_group_id');
    expect(cols).not.toContain('freight_pct');
    expect(cols).not.toContain('op_cost_pct');
    expect(cols).not.toContain('tax_pct');
  });
});
```

- [ ] **Step 2: Run test to verify pass (depends on PUBLIC_VARIATION_COLUMNS from Task 2)**

```bash
npx vitest run src/pages/__tests__/ProductDetails.test.tsx
```
Expected: PASS (columns are already safe from Task 2, this test just validates)

- [ ] **Step 3: Fix ProductDetails.tsx line 95 — replace `select('*')` with explicit columns**

Edit `src/pages/ProductDetails.tsx` at line 93-96:

```ts
// Before:
const { data: variationsData } = await supabase
  .from('product_variations')
  .select('*')
  .eq('product_id', id);

// After:
import { PUBLIC_VARIATION_COLUMNS } from '@/utils/productColumns';

const { data: variationsData } = await supabase
  .from('product_variations')
  .select(PUBLIC_VARIATION_COLUMNS)
  .eq('product_id', id);
```

- [ ] **Step 4: Run all existing tests to verify no regressions**

```bash
npm test
```
Expected: all 408 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/pages/ProductDetails.tsx src/pages/__tests__/ProductDetails.test.tsx
git commit -m "fix: use safe variation columns in ProductDetails public page"
```

---

### Task 4: FlashDealsCountdown.tsx — Substituir variations(*) wildcard

**Files:**
- Modify: `src/components/FlashDealsCountdown.tsx` (lines 67, 78, 93)

**Interfaces:**
- Consumes: `PUBLIC_VARIATION_COLUMNS` from `src/utils/productColumns.ts`
- Produces: safe embedded variation queries for public flash deals component

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/FlashDealsCountdown.test.tsx`:

```ts
import { describe, it, expect } from 'vitest';
import { PUBLIC_VARIATION_COLUMNS } from '@/utils/productColumns';

describe('FlashDealsCountdown variation columns', () => {
  it('deve usar colunas explícitas de variação, não wildcard', () => {
    // Verify the constant we depend on doesn't contain wildcard
    expect(PUBLIC_VARIATION_COLUMNS).not.toBe('*');
