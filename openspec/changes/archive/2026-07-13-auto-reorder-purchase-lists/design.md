## Context

Currently, stock alerts are purely visual — admins see products below minimum stock but must manually add each one to a purchase list. The goal is to automate this: when stock drops below the configured minimum, the system adds the product to a supplier-specific purchase list automatically, with a quantity suggested by sales velocity. When stock is replenished above the minimum, the item is removed.

### Development Approach

**TDD (Test-Driven Development) is mandatory.** Every implementation task must be preceded by its test:
- Database functions: write the test first (Deno/PostgreSQL), then implement the function
- Frontend components: write the test first (Vitest + Testing Library), then implement the component
- Each test starts red (failing), passes after implementation, and remains as regression protection

### Current State

- `products` table has `stock`, `min_stock`, `supplier_id` columns
- `product_variations` table has `stock`, `min_stock` columns (per-variation)
- `purchase_lists` table has `id`, `name`, `notes`, `created_by`
- `purchase_list_items` table has `id`, `list_id`, `product_id`, `variation_id`, `quantity`, `added_by`, UNIQUE(list_id, product_id, variation_id)
- `apply_stock_movement()` is the canonical function for atomic stock changes (writes to `stock_movements`)
- Stock alerts (`StockAlerts.tsx`) compute alerts client-side by comparing stock vs min_stock
- `suggestQuantity()` in `AddToPurchaseListDialog.tsx` calculates reorder quantity based on 60-day sales

## Goals / Non-Goals

**Goals:**
- Automatically add products to purchase lists when stock falls below min_stock
- Automatically remove products from purchase lists when stock exceeds min_stock (carrinho-vivo model)
- Group auto-generated lists by supplier
- Suggest reorder quantity based on 60-day sales velocity
- Handle products with and without variations
- Backfill existing critical products at deploy time

**Non-Goals:**
- Not creating a separate Edge Function or reorder queue (avoiding operational complexity)
- Not adding dismissed/hide logic for manually removed auto items (re-addition is acceptable)
- Not changing the manual `AddToPurchaseListDialog` flow
- No changes to the checkout, order, or payment systems

## Decisions

### Decision 1: Database triggers vs Edge Functions

**Chosen:** Database triggers (synchronous, inside stock UPDATE transaction)

| Alternative | Reason rejected |
|-------------|-----------------|
| Edge Function + reorder queue | Operational complexity (monitoring, retries, latency); every sale would enqueue |
| Database Webhook | Requires Supabase Pro; configuration is not versioned in migrations |

The trigger approach eliminates the reorder queue, async processing, and external dependencies. Error isolation via subtransaction ensures stock updates are never blocked by reorder failures.

### Decision 2: Trigger on stock_movements vs on products/product_variations

**Chosen:** AFTER UPDATE OF stock ON products AND product_variations

- A trigger on `stock_movements` would miss variation stock edits from `saveVariations()` (which updates `product_variations` directly without calling `apply_stock_movement`)
- Direct column triggers catch ALL stock changes regardless of which code path made them
- `UPDATE OF` clause limits trigger to only fire when the `stock` column is specifically targeted, avoiding unnecessary executions

### Decision 3: Quantity calculation in SQL

**Chosen:** SQL aggregation inside the trigger function

The existing `suggestQuantity()` JS function was analyzed and translated to SQL:
```sql
SELECT COALESCE(SUM(oi.quantity), 0) INTO v_sold
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE oi.product_id = p_product_id
  AND o.created_at >= now() - interval '60 days'
  AND o.status = ANY(ARRAY['em_preparo','enviado','entregado','retirado']);
```

Performance is safe due to existing indexes: `idx_order_items_product_id`, `idx_orders_created_at DESC`, `idx_orders_status`.

### Decision 4: Carniço-vivo model (remove on replenishment)

**Chosen:** Items are automatically removed from auto lists when stock exceeds min_stock.

This keeps the purchase list as a clean "what needs to be bought now" view. The alternative (keeping items for historical reference) was rejected because purchase lists already have manual lifecycle management — admins can archive or delete lists explicitly.

### Decision 5: Manual removal does not suppress re-addition

**Chosen:** No `dismissed_auto_items` table. Items re-appear on the next trigger cycle if still below min_stock.

Rationale: Simple, predictable behavior. Adding a dismissal mechanism adds complexity (expiry, reset conditions) for a rare case. Admins who want to suppress an item can raise the min_stock or assign a supplier override.

## Data Model Changes

### purchase_lists (ALTER)
```sql
ALTER TABLE purchase_lists ADD COLUMN supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE purchase_lists ADD COLUMN is_auto BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX idx_purchase_lists_auto_supplier ON purchase_lists(supplier_id) WHERE is_auto = true;
```

### purchase_list_items (ALTER)
```sql
ALTER TABLE purchase_list_items ADD COLUMN is_auto BOOLEAN NOT NULL DEFAULT false;
```

### reorder_errors (CREATE)
```sql
CREATE TABLE reorder_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  variation_id UUID,
  error_message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Trigger Architecture

### Functions

```
suggest_reorder_qty(product_id, current_stock, min_stock)
  → RETURNS INTEGER
  → Calcula sugestão baseada em vendas 60d (agregada por product_id, sem distinção de variação)
  → Usada pelo trigger e disponível para consulta

check_and_reorder()
  → RETURNS TRIGGER
  → Lógica central:
    1. Verifica se há threshold crossing (stock ou min_stock)
    2. Se stock > min_stock → DELETE de auto list (se presente)
    3. Se stock ≤ min_stock e cruzou de cima → INSERT/UPSERT na auto list
    4. Se supplier_id mudou → MOVE entre listas
    5. Erros capturados → INSERT em reorder_errors
```

### Trigger Registration

```sql
CREATE TRIGGER trg_auto_reorder_stock
  AFTER UPDATE OF stock ON products
  FOR EACH ROW EXECUTE FUNCTION check_and_reorder();

CREATE TRIGGER trg_auto_reorder_min_stock
  AFTER UPDATE OF min_stock ON products
  FOR EACH ROW EXECUTE FUNCTION check_and_reorder();

CREATE TRIGGER trg_auto_reorder_supplier
  AFTER UPDATE OF supplier_id ON products
  FOR EACH ROW EXECUTE FUNCTION check_and_reorder();

CREATE TRIGGER trg_auto_reorder_variation_stock
  AFTER UPDATE OF stock ON product_variations
  FOR EACH ROW EXECUTE FUNCTION check_and_reorder();

CREATE TRIGGER trg_auto_reorder_variation_min_stock
  AFTER UPDATE OF min_stock ON product_variations
  FOR EACH ROW EXECUTE FUNCTION check_and_reorder();
```

### Thread Safety

- `apply_stock_movement()` uses `SELECT ... FOR UPDATE` row-level locking
- The trigger fires AFTER the update, inside the same transaction
- `ON CONFLICT (list_id, product_id, variation_id) DO UPDATE` handles UPSERT safely
- For concurrent stock updates on the same product, the `FOR UPDATE` lock serializes them

## Trigger Function Logic Flow

```
check_and_reorder() called
│
├─ Early returns (no-op):
│  ├─ NEW.min_stock = 0
│  └─ TG_TABLE_NAME = 'product_variations' AND parent product has no supplier
│
├─ DETECT DIRECTION:
│  ├─ Stock > min_stock?
│  │  └─ DELETE FROM purchase_list_items WHERE product_id AND in auto list AND is_auto = true
│  │
│  └─ Stock ≤ min_stock?
│     └─ Crossed threshold? (OLD.stock > OLD.min_stock OR OLD.min_stock < NEW.min_stock)
│        ├─ Yes → UPSERT into auto purchase list with suggested quantity
│        └─ No → no-op (already below)
│
└─ Error? → subtransaction → INSERT INTO reorder_errors
```

## Frontend Changes

### PurchaseLists.tsx

- Add section renderer that groups lists by `is_auto`
- Auto lists section with heading "🔄 Reposição Automática"
- Manual lists section with heading "📋 Listas Manuais"
- Auto list cards show badge "Automática"
- Delete auto list: confirmation dialog warning about re-creation
- List rendering and item editing remains identical

### StockAlerts.tsx

- No changes needed — the existing `inListKeys` filter already excludes items in any purchase list from the alert display. When auto-reorder adds an item, it naturally disappears from alerts.

## Migration Plan

### Migration File (single SQL migration)

1. Add columns `supplier_id`, `is_auto` to `purchase_lists`
2. Create partial unique index `purchase_lists(supplier_id) WHERE is_auto`
3. Add column `is_auto` to `purchase_list_items`
4. Create `reorder_errors` table
5. Create function `suggest_reorder_qty()`
6. Create function `check_and_reorder()` (the trigger function)
7. Register all 5 triggers
8. Backfill: INSERT already-critical products into auto lists (with `suggest_reorder_qty`)

### Rollback

```sql
DROP TRIGGER IF EXISTS trg_auto_reorder_stock ON products;
DROP TRIGGER IF EXISTS trg_auto_reorder_min_stock ON products;
DROP TRIGGER IF EXISTS trg_auto_reorder_supplier ON products;
DROP TRIGGER IF EXISTS trg_auto_reorder_variation_stock ON product_variations;
DROP TRIGGER IF EXISTS trg_auto_reorder_variation_min_stock ON product_variations;
DROP FUNCTION IF EXISTS check_and_reorder();
DROP FUNCTION IF EXISTS suggest_reorder_qty();
DROP TABLE IF EXISTS reorder_errors;
ALTER TABLE purchase_list_items DROP COLUMN IF EXISTS is_auto;
ALTER TABLE purchase_lists DROP COLUMN IF EXISTS is_auto;
ALTER TABLE purchase_lists DROP COLUMN IF EXISTS supplier_id;
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Trigger failure blocks stock update | Subtransaction isolates errors; logged to `reorder_errors` |
| Duplicate trigger execution (ProductEdit double-write) | ProductEdit already excludes stock from direct UPDATE when stock changes — only `apply_stock_movement` touches stock. Single trigger fire per edit. |
| Performance impact on high-frequency stock updates | Trigger early-returns when `min_stock = 0` or no supplier; `UPDATE OF` limits firing to stock/min_stock changes only |
| Re-addition after manual removal frustrates admin | Explicitly accepted trade-off per product decision. Admin can set higher `min_stock` or remove supplier to suppress. |
| Variation stock edited via `DraftProducts` or `saveVariations` bypasses stock_movements | Trigger on `product_variations` table directly catches these — no dependency on `stock_movements` |
| Auto list accumulates many items over time | Carrinho-vivo model removes items when stock is replenished. Lists naturally stay lean. |
| Quantity suggestion may be imprecise for new products | Falls back to `MAX(min_stock - current_stock, 1)` when no sales data; admin can adjust quantity manually |

## Open Questions

- Should `DraftProducts` (rascunhos tab) also trigger auto-reorder? Draft products have `category = 'Pendente Revisão'` and are currently excluded from alerts. Likely no — draft products are not yet active.
- Should `reorder_errors` have a retention policy or be exposed in the admin UI? Initially just a log table; can add admin view later.
