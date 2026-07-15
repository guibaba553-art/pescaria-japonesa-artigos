## ADDED Requirements

### Requirement: Brand select with inline creation

The product form SHALL display a searchable brand selector (Combobox pattern) with a "+" button that opens a dialog for creating a new brand inline. The component SHALL be named `BrandSelect`.

#### Scenario: Select existing brand
- **WHEN** the user opens the brand dropdown and types part of a brand name
- **THEN** the dropdown filters to show matching brands
- **AND** the user can select one

#### Scenario: Create new brand via "+" button
- **WHEN** the user clicks the "+" button next to the brand selector
- **THEN** a dialog opens with a text input for the brand name
- **AND** upon submitting a unique name, the brand is created in `brands`
- **AND** the newly created brand is automatically selected

#### Scenario: Duplicate brand rejected
- **WHEN** the user attempts to create a brand with a name that already exists
- **THEN** a toast error message is shown indicating the duplicate

#### Scenario: Brand selector without selection
- **WHEN** no brand is selected
- **THEN** the trigger displays placeholder text (e.g., "Selecionar marca...")

### Requirement: Supplier select with search

The product form SHALL display a searchable supplier selector (Combobox pattern) showing only active suppliers, identified by `nome_fantasia` (falling back to `razao_social` when `nome_fantasia` is null). The component SHALL be named `SupplierSelect`.

#### Scenario: Select existing supplier
- **WHEN** the user opens the supplier dropdown and types part of a supplier name
- **THEN** the dropdown filters to show matching active suppliers by `nome_fantasia` or `razao_social`

#### Scenario: Inactive suppliers excluded
- **WHEN** the supplier dropdown is opened
- **THEN** only suppliers with `is_active = true` are listed

#### Scenario: Supplier display fallback
- **WHEN** a supplier has `nome_fantasia` set
- **THEN** `nome_fantasia` is displayed as the visible label
- **WHEN** a supplier has `nome_fantasia` null
- **THEN** `razao_social` is displayed as the visible label

#### Scenario: No supplier selected
- **WHEN** no supplier is selected
- **THEN** the trigger displays placeholder text (e.g., "Buscar fornecedor...")

### Requirement: New form row layout

The product form SHALL display brand and supplier selects in a new row below the Name/Category/Subcategory row, using a responsive two-column grid (stacked on mobile, side-by-side on desktop).

#### Scenario: Desktop layout
- **WHEN** the viewport is at desktop width (md breakpoint)
- **THEN** brand and supplier selects are displayed side by side in two equal columns

#### Scenario: Mobile layout
- **WHEN** the viewport is below the md breakpoint
- **THEN** brand and supplier selects are stacked vertically, each occupying full width

### Requirement: Product save includes brand_id and supplier_id

The product form SHALL include `brand_id` and `supplier_id` in the payload when creating or updating a product.

#### Scenario: Save product with brand and supplier
- **WHEN** the user saves a product with both brand and supplier selected
- **THEN** the payload includes both `brand_id` and `supplier_id`

#### Scenario: Save product without brand or supplier
- **WHEN** the user saves a product with neither brand nor supplier selected
- **THEN** the payload includes `brand_id: null` and `supplier_id: null`

### Requirement: Edit form loads existing brand and supplier

When editing an existing product, the form SHALL pre-select the product's currently assigned brand and supplier.

#### Scenario: Edit product with brand assigned
- **WHEN** the edit form opens for a product with `brand_id` set
- **THEN** the BrandSelect displays the corresponding brand name as selected

#### Scenario: Edit product with supplier assigned
- **WHEN** the edit form opens for a product with `supplier_id` set
- **THEN** the SupplierSelect displays the corresponding supplier name as selected
