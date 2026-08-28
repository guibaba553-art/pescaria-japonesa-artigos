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
