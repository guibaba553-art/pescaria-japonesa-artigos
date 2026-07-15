## Why

O formulário de cadastro/edição de produto (ProductEdit) não permite associar uma marca ou fornecedor ao produto, apesar de ambas as estruturas existirem conceitualmente no domínio. Fornecedores já são cadastrados na aba "Fornecedores" do catálogo via tabela `suppliers`, e a coluna `supplier_id` existe em `products` mas nunca foi exposta no formulário. Marcas são armazenadas como texto livre em `products.brand`, sem validação ou curadoria, e o campo sequer tem input visível no formulário atual.

## What Changes

- **Criação da tabela `brands`**: Nova tabela com id e nome único, substituindo o campo texto livre `products.brand`. Migração com backfill dos valores distintos existentes.
- **Novo select "Marca" no ProductEdit**: Combobox com busca + botão "+" para criar nova marca inline (padrão similar ao SubcategorySelect existente).
- **Novo select "Fornecedor" no ProductEdit**: Combobox com busca exibindo nome fantasia dos fornecedores ativos.
- **Nova linha no formulário**: Ambos os selects ocupam uma linha completa abaixo de Nome/Categoria/Subcategoria, com layout responsivo (2 colunas em desktop, empilhado em mobile).
- **Remoção da coluna `products.brand` TEXT**: Substituída por `products.brand_id` (FK → brands).
- **Atualização do payload de save**: ProductEdit passa a enviar `brand_id` e `supplier_id`.

## Capabilities

### New Capabilities

- `brand-management`: CRUD básico de marcas (tabela `brands`) com criação inline no formulário de produto.
- `product-brand-supplier-form`: Selects de marca e fornecedor no formulário de cadastro/edição de produto, com busca e criação inline de marca.

### Modified Capabilities

<!-- Nenhum spec existente é alterado — não há specs no projeto ainda. -->

## Impact

- **Database**: Nova tabela `brands` + migration (create table, backfill, drop column `products.brand`, add FK `products.brand_id`)
- **Components**: Novo `BrandSelect.tsx`, novo `SupplierSelect.tsx`, modificação em `ProductEdit.tsx`
- **Types**: `src/types/product.ts` — `brand` → `brand_id`, adição de `supplier_id`
- **Tests**: Novos testes para BrandSelect, SupplierSelect; atualização de ProductEdit.test.tsx
- **Dependencies**: Nenhuma nova dependência — usa `Command` e `Popover` já existentes no projeto
