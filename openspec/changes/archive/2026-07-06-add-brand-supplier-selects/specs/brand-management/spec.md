## ADDED Requirements

### Requirement: Brands table exists

The system SHALL maintain a `brands` table with columns `id` (UUID, primary key), `name` (TEXT, unique, not null), `created_at` (TIMESTAMPTZ), and `updated_at` (TIMESTAMPTZ).

#### Scenario: Table structure
- **WHEN** the migration is applied
- **THEN** table `brands` exists with columns `id`, `name`, `created_at`, `updated_at`
- **AND** column `name` has a UNIQUE constraint

### Requirement: Products reference brand by ID

The system SHALL add a `brand_id` column to `products` as a foreign key referencing `brands(id)` with `ON DELETE SET NULL`.

#### Scenario: Product has brand reference
- **WHEN** a product is created or updated with a `brand_id`
- **THEN** the value is stored and references a valid row in `brands`

#### Scenario: Brand deleted
- **WHEN** a brand is deleted from the `brands` table
- **THEN** all products referencing that brand SHALL have their `brand_id` set to NULL

### Requirement: Legacy brand data is backfilled

The system SHALL migrate existing distinct non-null, non-empty values from `products.brand` into the `brands` table and populate `products.brand_id` accordingly during migration.

#### Scenario: Backfill existing brands
- **WHEN** the migration runs on a database with products containing `brand` values
- **THEN** each distinct non-empty `brand` value becomes a row in `brands`
- **AND** each product's `brand_id` is set to the corresponding `brands.id`

### Requirement: Legacy brand column is dropped

The system SHALL drop the `products.brand` TEXT column after backfill is complete.

#### Scenario: Column removed
- **WHEN** the migration completes
- **THEN** the `brand` column no longer exists on the `products` table

### Requirement: Authenticated users can read brands

The system SHALL allow any authenticated user to SELECT from the `brands` table.

#### Scenario: Read access
- **WHEN** an authenticated user queries `brands`
- **THEN** all brand rows are returned

### Requirement: Admin users can create and modify brands

The system SHALL allow users with admin or employee role to INSERT and UPDATE rows in the `brands` table.

#### Scenario: Create brand
- **WHEN** an admin inserts a new brand with a unique name
- **THEN** the brand is created successfully

#### Scenario: Duplicate name rejected
- **WHEN** any user tries to insert a brand with an existing name
- **THEN** the operation fails with a uniqueness violation

### Requirement: Admin users can delete brands

The system SHALL allow users with admin role to DELETE rows from the `brands` table.

#### Scenario: Delete brand
- **WHEN** an admin deletes a brand
- **THEN** the brand is removed and product references are set to NULL
