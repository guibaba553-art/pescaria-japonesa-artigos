# purchase-list-supplier Specification

## ADDED Requirements

### Requirement: Auto purchase lists are created per supplier

The system SHALL maintain at most one auto-generated purchase list per supplier.

#### Scenario: First item triggers list creation
- **WHEN** the first item is auto-added for a supplier
- **AND** no auto purchase list exists for that supplier
- **THEN** a new `purchase_lists` row SHALL be created with:
  - `name`: `"🔄 Reposição - {supplier.nome_fantasia or supplier.razao_social}"`
  - `supplier_id`: the supplier's UUID
  - `is_auto`: `true`
  - `created_by`: the system UUID (`00000000-0000-0000-0000-000000000000`)

#### Scenario: Existing auto list is reused
- **WHEN** a product needs to be auto-added for a supplier
- **AND** an auto purchase list already exists for that supplier
- **THEN** the item SHALL be added to the existing auto list

#### Scenario: Unique constraint prevents duplicate auto lists
- **WHEN** a migration or trigger attempts to create a second auto list for the same supplier
- **THEN** the operation SHALL fail with a unique constraint violation (partial unique index on `supplier_id WHERE is_auto = true`)

### Requirement: Auto list items are tracked separately

Each item in a purchase list SHALL indicate whether it was added automatically or manually.

#### Scenario: Auto-added item has is_auto flag
- **WHEN** the trigger inserts an item into `purchase_list_items`
- **THEN** `is_auto` SHALL be set to `true`

#### Scenario: Manually added item has is_auto flag
- **WHEN** a user adds an item via `AddToPurchaseListDialog`
- **THEN** `is_auto` SHALL be set to `false`

### Requirement: Duplicate auto-adds update quantity

If a product is added again while already in the auto list, the system SHALL update the suggested quantity rather than creating a duplicate.

#### Scenario: UPSERT behavior on add
- **WHEN** the trigger attempts to add a product to an auto list
- **AND** the product (and variation, if applicable) already exists in that list
- **THEN** the system SHALL update the `quantity` to the newly suggested value
- **AND** keep `is_auto = true`

### Requirement: Stock replenishment removes auto items

When stock is replenished above min_stock, the trigger SHALL remove the item from the auto purchase list.

#### Scenario: Item removed on replenishment
- **WHEN** `NEW.stock > NEW.min_stock`
- **AND** the item exists in an auto purchase list with `is_auto = true`
- **THEN** the trigger SHALL DELETE the item from the purchase list

#### Scenario: Manual items are not auto-removed
- **WHEN** `NEW.stock > NEW.min_stock`
- **AND** the item exists in a purchase list with `is_auto = false`
- **THEN** the trigger SHALL NOT remove the item (manual items persist regardless of stock level)

### Requirement: Supplier change moves items between lists

When a product's `supplier_id` changes, any auto list items SHALL follow to the new supplier's list.

#### Scenario: Item moved to new supplier
- **WHEN** a product's `supplier_id` is updated
- **AND** the product has an item in the old supplier's auto list
- **AND** the product's stock is ≤ the product's min_stock
- **THEN** the item SHALL be removed from the old supplier's auto list
- **AND** the item SHALL be added to the new supplier's auto list (creating it if needed)

#### Scenario: Item removed on supplier change to NULL
- **WHEN** a product's `supplier_id` is updated to NULL
- **AND** the product has an item in the old supplier's auto list
- **THEN** the item SHALL be removed from the old supplier's auto list
- **AND** SHALL NOT be re-added until a supplier is assigned

### Requirement: Auto lists are visually distinct in the UI

The PurchaseLists component SHALL display auto-generated lists separately from user-created lists.

#### Scenario: Auto list badge
- **WHEN** a list has `is_auto = true`
- **THEN** it SHALL display with a "🔄" prefix in its name
- **AND** a visual badge indicating it is auto-generated

#### Scenario: Auto lists section
- **WHEN** rendering purchase lists
- **THEN** auto lists SHALL be grouped in a separate section titled "Reposição Automática"
- **AND** manual lists SHALL be in a separate section titled "Listas Manuais"

#### Scenario: Delete confirmation for auto lists
- **WHEN** a user attempts to delete an auto-generated list
- **THEN** a confirmation dialog SHALL warn that items may be re-created

### Requirement: Manual removal does not suppress re-addition

If a user removes an item from an auto purchase list, the system SHALL re-add it on the next trigger cycle if the product remains below min_stock.

#### Scenario: Re-addition after manual removal
- **WHEN** a user deletes an `is_auto = true` item from a purchase list
- **AND** the product's stock remains ≤ min_stock
- **AND** a subsequent stock update triggers `check_and_reorder()`
- **THEN** the item SHALL be re-added to the auto list
