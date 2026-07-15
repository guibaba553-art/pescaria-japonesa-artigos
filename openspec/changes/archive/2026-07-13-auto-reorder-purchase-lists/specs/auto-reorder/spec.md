# auto-reorder Specification

## ADDED Requirements

### Requirement: Trigger detects product stock threshold crossing

The system SHALL fire a trigger on `UPDATE OF stock` on the `products` table that detects when a product's stock crosses from above its `min_stock` to below or equal to `min_stock`.

#### Scenario: Stock drops below min_stock
- **WHEN** a product's `stock` is updated from a value > `min_stock` to a value ≤ `min_stock`
- **AND** `min_stock > 0`
- **AND** `supplier_id` IS NOT NULL
- **THEN** the trigger SHALL add the product to the auto-generated purchase list for that supplier

#### Scenario: Stock already below min_stock and drops further
- **WHEN** a product's `stock` is updated but both OLD and NEW values are ≤ `min_stock`
- **THEN** the trigger SHALL NOT re-add the product (no threshold crossing occurred)

#### Scenario: Stock crosses back above min_stock
- **WHEN** a product's `stock` is updated from a value ≤ `min_stock` to a value > `min_stock`
- **THEN** the trigger SHALL remove the product from the auto-generated purchase list (if present)

#### Scenario: Product without supplier
- **WHEN** a product's `stock` drops below `min_stock`
- **AND** `supplier_id` IS NULL
- **THEN** the trigger SHALL NOT add the product to any auto purchase list

#### Scenario: min_stock is zero
- **WHEN** a product's `stock` is updated
- **AND** `min_stock = 0`
- **THEN** the trigger SHALL NOT add or remove the product (zero means no minimum configured)

### Requirement: Trigger detects variation stock threshold crossing

The system SHALL fire a trigger on `UPDATE OF stock` on the `product_variations` table that applies the same threshold-crossing logic for each variation individually.

#### Scenario: Variation stock drops below variation min_stock
- **WHEN** a variation's `stock` is updated from a value > its `min_stock` to a value ≤ its `min_stock`
- **AND** the variation's `min_stock > 0`
- **AND** the parent product's `supplier_id` IS NOT NULL
- **THEN** the trigger SHALL add the item (product_id + variation_id) to the auto-generated purchase list for that supplier

#### Scenario: Variation min_stock falls back to parent product min_stock
- **WHEN** a variation has no `min_stock` defined (0 or NULL)
- **THEN** the system SHALL use the parent product's `min_stock` as fallback

### Requirement: Trigger reacts to min_stock changes

The system SHALL fire a trigger on `UPDATE OF min_stock` on both `products` and `product_variations` tables.

#### Scenario: min_stock increases and stock becomes critical
- **WHEN** a product's `min_stock` is updated to a higher value
- **AND** `NEW.stock ≤ NEW.min_stock`
- **AND** the product was NOT previously below min_stock (OLD.stock > OLD.min_stock)
- **THEN** the trigger SHALL add the product to the auto purchase list

#### Scenario: min_stock decreases and stock is no longer critical
- **WHEN** a product's `min_stock` is updated to a lower value
- **AND** `NEW.stock > NEW.min_stock`
- **AND** the product was previously below min_stock (OLD.stock ≤ OLD.min_stock)
- **THEN** the trigger SHALL remove the product from the auto purchase list

#### Scenario: min_stock changes but stock status unchanged
- **WHEN** a product's `min_stock` is updated
- **AND** the relationship between stock and min_stock has not crossed a threshold (both OLD and NEW are either both above or both below)
- **THEN** the trigger SHALL NOT modify the purchase list

### Requirement: Suggested quantity uses sales velocity

The system SHALL calculate a suggested reorder quantity based on sales data from the last 60 days.

#### Scenario: Quantity calculation
- **WHEN** a product is being added to the auto purchase list
- **THEN** the suggested quantity SHALL be calculated as:
  - `sold_60d = SUM of order_items.quantity` for the product across orders with status `em_preparo`, `enviado`, `entregado`, or `retirado` in the last 60 days
  - `per_day = sold_60d / 60`
  - `target_30d = CEIL(per_day × 30)`
  - `need = MAX(target_30d - current_stock, min_stock - current_stock, 1)`
  - Final quantity = `MAX(1, need)`

#### Scenario: No sales data available
- **WHEN** a product has no sales in the last 60 days
- **THEN** the suggested quantity SHALL be `MAX(min_stock - current_stock, 1)`

### Requirement: Trigger failure does not block stock updates

If the auto-reorder trigger encounters an error, the stock update (sale, adjustment, or entry) SHALL complete successfully and the error SHALL be logged.

#### Scenario: Trigger error isolation
- **WHEN** the trigger function raises an exception
- **THEN** the exception SHALL be caught within a subtransaction
- **AND** the error SHALL be logged to the `reorder_errors` table
- **AND** the triggering stock update SHALL NOT be rolled back

#### Scenario: Error logging
- **WHEN** an error is logged to `reorder_errors`
- **THEN** the record SHALL contain `product_id`, `variation_id` (if applicable), `error_message`, and `created_at`

### Requirement: Backfill for existing critical stock

The migration SHALL include a one-time backfill that adds all products already below their min_stock at deploy time to their supplier's auto purchase list.

#### Scenario: Initial backfill
- **WHEN** the migration is applied
- **THEN** all products with `stock ≤ min_stock`, `min_stock > 0`, and `supplier_id IS NOT NULL` SHALL be added to their respective auto purchase lists
- **AND** products already in any purchase list SHALL be skipped
