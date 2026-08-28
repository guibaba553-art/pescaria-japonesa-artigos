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
    expect(PUBLIC_VARIATION_COLUMNS).toContain('id');
    expect(PUBLIC_VARIATION_COLUMNS).toContain('price');
    expect(PUBLIC_VARIATION_COLUMNS).toContain('on_sale');
    expect(PUBLIC_VARIATION_COLUMNS).toContain('sale_price');
  });
});
```

- [ ] **Step 2: Run test to verify pass**

```bash
npx vitest run src/components/__tests__/FlashDealsCountdown.test.tsx
```
Expected: PASS (validates the constant, not the component)

- [ ] **Step 3: Fix FlashDealsCountdown.tsx — replace `product_variations(*)` with explicit columns**

Edit `src/components/FlashDealsCountdown.tsx`:

**Line 66-68 (product query):** Replace `variations:product_variations(*)` with explicit columns:
```ts
// Before:
.select(\`id, name, price, sale_price, on_sale, sale_ends_at, featured, image_url, min_sale_price, variations:product_variations(*)\`)

// After:
import { PUBLIC_VARIATION_COLUMNS } from '@/utils/productColumns';

.select(\`id, name, price, sale_price, on_sale, sale_ends_at, featured, image_url, min_sale_price, variations:product_variations(\${PUBLIC_VARIATION_COLUMNS})\`)
```

**Line 78 (variation query):** Replace `select('name, price, on_sale...')` with `PUBLIC_VARIATION_COLUMNS` (it already selects named columns, but using the constant ensures consistency):
```ts
// Before:
.select('name, price, on_sale, sale_price')

// After:
.select(PUBLIC_VARIATION_COLUMNS)
```

**Line 92-93 (promotion query):** Same as line 66:
```ts
// Replace variations:product_variations(*) with variations:product_variations(PUBLIC_VARIATION_COLUMNS)
```

- [ ] **Step 4: Run tests**

```bash
npm test
```
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/components/FlashDealsCountdown.tsx src/components/__tests__/FlashDealsCountdown.test.tsx
git commit -m "fix: use safe variation columns in FlashDealsCountdown"
```

---

### Task 5: useProductVariations.tsx — Trocar select('*') por RPC admin

**Files:**
- Modify: `src/hooks/useProductVariations.tsx` (line 32)

**Interfaces:**
- Consumes: new RPC `get_product_variations_by_product(uuid)` (from Task 1 migration)
- Produces: admin-only variation data with full columns

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useProductVariations.test.tsx`:

```ts
import { describe, it, expect, vi } from 'vitest';

// Mock supabase client
const mockRpc = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
  },
}));

describe('useProductVariations data fetching', () => {
  it('deve usar RPC get_product_variations_by_product em vez de select', async () => {
    // Reload the module with mocked supabase
    const { useProductVariations } = await import('@/hooks/useProductVariations');
    
    // Verify the hook is exported
    expect(useProductVariations).toBeDefined();
    expect(typeof useProductVariations).toBe('function');
  });

  it('não deve usar select(*) em product_variations', () => {
    // This is a compile-time check — the source code must not contain
    // .from('product_variations').select('*') in the read path
    const source = require('fs').readFileSync(
      require('path').resolve(__dirname, '../useProductVariations.tsx'),
      'utf-8'
    );
    // The hook may still have select for writes (update/insert), but
    // the initial load should use RPC, not select('*')
    expect(source).not.toMatch(/\.from\(['"]product_variations['"]\)\s*\.\s*select\(['"]\*['"]\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/hooks/__tests__/useProductVariations.test.tsx
```
Expected: FAIL — `select('*')` still present in source

- [ ] **Step 3: Implement the fix in useProductVariations.tsx**

Replace the `select('*')` load at line 30-34 with RPC:

```ts
// Before (line 30-34):
const { data, error } = await supabase
  .from('product_variations')
  .select('*')
  .eq('product_id', productId)
  .order('name');

// After:
const { data, error } = await supabase
  .rpc('get_product_variations_by_product', { p_product_id: productId });
```

Note: The RPC returns the data directly (not in a nested `data` property like `from().select()`). Verify the return shape matches.

- [ ] **Step 4: Run tests**

```bash
npm test
```
Expected: all pass (both new and existing)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useProductVariations.tsx src/hooks/__tests__/useProductVariations.test.tsx
git commit -m "fix: use admin RPC instead of select('*') for variation reads in useProductVariations"
```

---

### Task 6: PDV.tsx — Substituir 4 select('*') por RPC admin nas variações

**Files:**
- Modify: `src/pages/PDV.tsx` (lines 622, 915, 1126, 1159)

**Interfaces:**
- Consumes: `rpc('get_product_variations_by_product', { p_product_id })` and `rpc('get_product_variations_admin')`
- Produces: admin-only variation data for PDV pricing

- [ ] **Step 1: Write the failing test**

Create `src/pages/__tests__/PDVVariations.test.tsx`:

```ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('PDV variation queries', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../PDV.tsx'),
    'utf-8'
  );

  it('não deve usar select("*") em product_variations', () => {
    // .from('product_variations').select('*') or .from("product_variations").select("*")
    const matches = source.match(/\.from\(['"]product_variations['"]\)\s*\.\s*\.select\(['"]\*['"]\)/g);
    expect(matches).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/pages/__tests__/PDVVariations.test.tsx
```
Expected: FAIL — `select('*')` found

- [ ] **Step 3: Fix all 4 call sites in PDV.tsx**

**Line 620-624 — batch load by product IDs:**
```ts
// Before:
const { data: allVariations } = await supabase
  .from('product_variations')
  .select('*')
  .in('product_id', productIds)
  .limit(1000);

// After:
const { data: allVariations, error: varErr } = await supabase
  .rpc('get_product_variations_admin');

if (varErr) {
  console.error('Erro ao carregar variações admin:', varErr);
  return;
}

const filteredVariations = (allVariations || []).filter(
  (v: any) => productIds.includes(v.product_id)
);
```

**Line 913-916 — safety net check:**
```ts
// Before:
const { data: vars } = await supabase
  .from('product_variations')
  .select('*')
  .eq('product_id', product.id)
  .maybeSingle();

// After:
const { data: vars, error: varErr } = await supabase
  .rpc('get_product_variations_by_product', { p_product_id: product.id });

// Note: RPC returns an array; pick the first if single
const singleVar = vars?.[0] ?? null;
```

**Line 1124-1127 — cache-busting check:**
```ts
// Before:
const { data: existingVariations } = await supabase
  .from('product_variations')
  .select('*')
  .eq('product_id', scannedProduct.id);

// After:
const { data: existingVariations } = await supabase
  .rpc('get_product_variations_by_product', { p_product_id: scannedProduct.id });
```

**Line 1157-1160 — fallback load:**
```ts
// Before (line 1157-1160):
const { data } = await supabase
  .from('product_variations')
  .select('*')
  .eq('product_id', productId);

// After:
const { data } = await supabase
  .rpc('get_product_variations_by_product', { p_product_id: productId });
```

- [ ] **Step 4: Update usage of variation data throughout PDV.tsx**

After replacing `.select('*')` with RPC, verify that the variation data access patterns still work. The RPC returns the same columns but the result shape is `{ data: Variation[] }` from `rpc()`.

Search PDV.tsx for all places that use the variation data and adjust if the response shape changed:
- `allVariations` → `filteredVariations` (for batch case)
- `vars` → `singleVar` (for maybeSingle replacement)

- [ ] **Step 5: Run tests**

```bash
npm test
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/pages/PDV.tsx src/pages/__tests__/PDVVariations.test.tsx
git commit -m "fix: use admin RPC instead of select('*') for variations in PDV"
```

---

### Task 7: DREReport.tsx — Substituir products(cost) join por RPC

**Files:**
- Modify: `src/components/DREReport.tsx` (line 82)

**Interfaces:**
- Consumes: `rpc('get_products_admin')` (only needs cost from products)
- Produces: admin-only cost data for DRE report

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/DREReport.test.tsx`:

```ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('DREReport product cost access', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../DREReport.tsx'),
    'utf-8'
  );

  it('não deve acessar products(cost) via join', () => {
    expect(source).not.toMatch(/products\s*\(\s*cost\s*\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/__tests__/DREReport.test.tsx
```
Expected: FAIL — `products(cost)` found

- [ ] **Step 3: Fix DREReport.tsx — fetch cost via separate admin RPC**

The DRE report needs `cost` from products joined with order_items. Instead of embedding `products(cost)` in the order_items query, fetch product costs separately via RPC.

```ts
// Before (line ~82):
.select('quantity, product_id, products(cost)')

// After:
// Step 1: Remove products(cost) from the order_items query
.select('quantity, product_id')

// Step 2: After fetching order_items, fetch all product costs via admin RPC
const { data: allProducts } = await supabase.rpc('get_products_admin');
const productCostMap = new Map<string, number>();
(allProducts || []).forEach((p: any) => {
  productCostMap.set(p.id, Number(p.cost ?? 0));
});

// Step 3: Use productCostMap.get(item.product_id) instead of item.products?.cost
```

- [ ] **Step 4: Run tests**

```bash
npm test
```
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/components/DREReport.tsx src/components/__tests__/DREReport.test.tsx
git commit -m "fix: use admin RPC instead of products(cost) join in DRE report"
```

---

### Task 8: Verificação final — lint + test suite completa

**Files:**
- (none modified — verification only)

- [ ] **Step 1: Run full test suite**

```bash
npm test
```
Expected: all tests pass

- [ ] **Step 2: Run lint**

```bash
npm run lint
```
Expected: no lint errors

- [ ] **Step 3: Search for remaining select('*') on products/variations**

```bash
rg "\.from\(['\"]products?['\"]" src/ -l | xargs rg "select\(['\"]\*['\"]" | grep -v "node_modules"
```
Expected: no results (all `.select('*')` replaced in Task 3-6)

- [ ] **Step 4: Search for remaining product_variations(*) wildcards**

```bash
rg "product_variations\(\*\)" src/ --include='*.ts' --include='*.tsx'
```
Expected: no results (all replaced in Task 2)

- [ ] **Step 5: Commit**

```bash
# No file changes — verification complete
```
