## 1. Data Model Migration

- [x] 1.1 Add `supplier_id` (UUID FK → suppliers) and `is_auto` (BOOLEAN DEFAULT false) columns to `purchase_lists`
- [x] 1.2 Create partial unique index `idx_purchase_lists_auto_supplier ON purchase_lists(supplier_id) WHERE is_auto = true`
- [x] 1.3 Add `is_auto` (BOOLEAN DEFAULT false) column to `purchase_list_items`
- [x] 1.4 Create `reorder_errors` table (id, product_id, variation_id, error_message, created_at)

## 2. suggest_reorder_qty — TDD

- [x] 2.1 **Test:** Write database test for `suggest_reorder_qty` returning correct quantity with 60-day sales data (various sold quantities)
- [x] 2.2 **Test:** Write database test for `suggest_reorder_qty` falling back to `MAX(min_stock - current_stock, 1)` when no sales data
- [x] 2.3 **Test:** Write database test for `suggest_reorder_qty` minimum floor of 1
- [x] 2.4 **Implement:** Create `suggest_reorder_qty(p_product_id UUID, p_current_stock INTEGER, p_min_stock INTEGER)` function with 60-day sales velocity calculation in SQL

## 3. check_and_reorder — TDD (scenario by scenario)

- [x] 3.1 **Test:** Write database test for threshold crossing — stock drops from above min_stock to below, item added to auto list
- [x] 3.2 **Test:** Write database test for no-op when stock already below min_stock and drops further (no crossing)
- [x] 3.3 **Test:** Write database test for stock replenishment — stock goes above min_stock, item removed from auto list
- [x] 3.4 **Test:** Write database test for min_stock increase — stock ≤ new min_stock triggers add
- [x] 3.5 **Test:** Write database test for min_stock decrease — stock > new min_stock triggers remove
- [x] 3.6 **Test:** Write database test for variation threshold crossing (stock vs variation.min_stock)
- [x] 3.7 **Test:** Write database test for variation with no min_stock falling back to product.min_stock
- [x] 3.8 **Test:** Write database test for supplier change moving items between lists
- [x] 3.9 **Test:** Write database test for error isolation — trigger failure logs to reorder_errors without rolling back stock update
- [x] 3.10 **Test:** Write database test for early returns (min_stock = 0, no supplier)
- [x] 3.11 **Implement:** Create `check_and_reorder()` trigger function handling all threshold crossing scenarios

## 4. Trigger Registration

- [x] 4.1 Register `trg_auto_reorder_stock` AFTER UPDATE OF stock ON products
- [x] 4.2 Register `trg_auto_reorder_min_stock` AFTER UPDATE OF min_stock ON products
- [x] 4.3 Register `trg_auto_reorder_supplier` AFTER UPDATE OF supplier_id ON products
- [x] 4.4 Register `trg_auto_reorder_variation_stock` AFTER UPDATE OF stock ON product_variations
- [x] 4.5 Register `trg_auto_reorder_variation_min_stock` AFTER UPDATE OF min_stock ON product_variations
- [x] 4.6 **Test:** End-to-end database test — UPDATE products SET stock triggers the chain and populates purchase_list_items

## 5. Backfill

- [x] 5.1 **Test:** Write database test that backfill query correctly adds already-critical products to auto lists
- [x] 5.2 **Implement:** Write and include backfill query in the migration to add all products already below `min_stock` (with `supplier_id` not null and `min_stock > 0`) to their respective auto lists, skipping items already in any purchase list

## 6. Frontend — PurchaseLists UI Split (TDD)

- [x] 6.1 **Test:** Write frontend test for PurchaseLists rendering auto lists in separate section with heading "🔄 Reposição Automática"
- [x] 6.2 **Test:** Write frontend test for PurchaseLists rendering manual lists in separate section with heading "📋 Listas Manuais"
- [x] 6.3 **Test:** Write frontend test for auto list cards displaying "Automática" badge
- [x] 6.4 **Test:** Write frontend test for delete confirmation dialog on auto lists
- [x] 6.5 **Implement:** Add section rendering to PurchaseLists: group lists by `is_auto` with separate headings
- [x] 6.6 **Implement:** Add "Automática" badge on auto-generated list cards
- [x] 6.7 **Implement:** Add confirmation dialog with warning about re-creation when deleting auto lists
