## Why

When a product's stock falls below the configured minimum, the system currently only shows a visual alert in the Stock Alerts tab. The admin must manually click "Adicionar à lista" for each product to add it to a purchase list — repetitive work that delays replenishment and causes stockouts. We need the system to automatically add items to supplier-specific purchase lists as soon as stock drops below the minimum, and remove them when stock is replenished.

## What Changes

- **Database triggers** on `products.stock` and `product_variations.stock` detect threshold crossings (stock goes from above min_stock to below/equal) and automatically add items to a per-supplier purchase list
- **Quantity suggestion** based on 60-day sales velocity runs inside the trigger (SQL)
- **Automatic removal** when stock is replenished above min_stock (carrinho-vivo model)
- `purchase_lists` gains `supplier_id` (UUID FK) and `is_auto` (BOOLEAN) columns
- `purchase_list_items` gains `is_auto` (BOOLEAN) column
- **New trigger** on `min_stock` increase — if stock ≤ new min_stock, add to list
- **New trigger** on `min_stock` decrease — if stock > new min_stock, remove from list
- **New trigger** on `supplier_id` change — move item between supplier lists
- **Backfill migration** for products already below min_stock at deploy time
- **New table** `reorder_errors` for logging trigger failures (non-blocking)
- **UI split** in PurchaseLists: auto-generated lists (per supplier) shown separately from manual lists, with visual distinction

## Capabilities

### New Capabilities
- `auto-reorder`: Trigger-based engine that detects stock threshold crossings and automatically manages purchase list items — adding when stock drops below minimum (with sales-velocity quantity suggestion) and removing when stock is replenished
- `purchase-list-supplier`: Supplier-based purchase list organization — auto-created lists are tied to a supplier, coexist with manual lists, and items follow the product when supplier changes

### Modified Capabilities
- *(none — these are new capabilities)*

## Impact

- **Database (Supabase migration):** New columns on `purchase_lists` (`supplier_id`, `is_auto`) and `purchase_list_items` (`is_auto`), new table `reorder_errors`, new functions `suggest_reorder_qty()` and `check_and_reorder()`, triggers on `products` and `product_variations`, unique partial index on `purchase_lists(supplier_id) WHERE is_auto`
- **Frontend (`PurchaseLists.tsx`):** Separate rendering for auto vs manual lists, visual badge on auto lists, confirmation before deleting auto lists
- **Edge functions:** No new edge functions (chosen design eliminates need for Edge Function or reorder queue)
- **No API changes:** Everything is DB-triggered; existing `AddToPurchaseListDialog` continues working for manual additions
