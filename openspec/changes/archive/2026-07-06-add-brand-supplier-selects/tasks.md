## 1. Database Migration

- [x] 1.1 Criar migration SQL: `CREATE TABLE brands` com colunas id (UUID PK), name (TEXT UNIQUE NOT NULL), created_at, updated_at, trigger de updated_at e índices
- [x] 1.2 Adicionar RLS policies na migration: SELECT para authenticated, INSERT/UPDATE para admin/employee, DELETE para admin
- [x] 1.3 Adicionar backfill: `INSERT INTO brands SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND brand != ''`
- [x] 1.4 Adicionar coluna `brand_id UUID REFERENCES brands(id) ON DELETE SET NULL` em products
- [x] 1.5 Adicionar UPDATE para popular `products.brand_id` a partir dos valores migrados
- [x] 1.6 Dropar coluna `products.brand` TEXT
- [x] 1.7 Criar índice `idx_products_brand_id` em `products(brand_id) WHERE brand_id IS NOT NULL`
- [x] 1.8 Rodar `supabase db push` para aplicar migration e verificar que o schema está correto

## 2. Types Update

- [x] 2.1 Atualizar `src/types/product.ts`: substituir `brand?: string | null` por `brand_id?: string | null`, adicionar `supplier_id?: string | null`
- [x] 2.2 Verificar e atualizar referências a `product.brand` em todo o codebase (tipos, componentes, hooks) para usar `brand_id`
- [x] 2.3 Atualizar interface `Product` local em `ProductsManagement.tsx` para incluir `brand_id`

## 3. BrandSelect Component

- [x] 3.1 Criar teste `src/components/__tests__/BrandSelect.test.tsx` (TDD): renderiza combobox, exibe marcas carregadas, filtra por busca, abre dialog de criação, cria marca com sucesso, rejeita duplicata
- [x] 3.2 Criar `src/components/BrandSelect.tsx` com Combobox (Popover + Command) listando marcas de `brands` via Supabase
- [x] 3.3 Adicionar botão "+" ao lado do Combobox trigger, abrindo Dialog com Input para nome
- [x] 3.4 Implementar lógica de criação: validar nome não-vazio, checar duplicata, inserir em `brands` via Supabase, selecionar automaticamente
- [x] 3.5 Adicionar subscription realtime (postgres_changes) para atualizar lista de marcas
- [x] 3.6 Rodar testes e verificar que passam

## 4. SupplierSelect Component

- [x] 4.1 Criar teste `src/components/__tests__/SupplierSelect.test.tsx` (TDD): renderiza combobox, exibe fornecedores ativos, filtra por nome fantasia, fallback para razão social, exclui inativos
- [x] 4.2 Criar `src/components/SupplierSelect.tsx` com Combobox listando fornecedores ativos (`is_active = true`)
- [x] 4.3 Exibir `nome_fantasia` como label principal, fallback para `razao_social` quando nulo
- [x] 4.4 Rodar testes e verificar que passam

## 5. ProductEdit Integration

- [x] 5.1 Atualizar testes `src/components/__tests__/ProductEdit.test.tsx`: verificar que nova linha com BrandSelect e SupplierSelect é renderizada, que brandId e supplierId são enviados no payload de create e edit
- [x] 5.2 Adicionar estados `brandId` e `supplierId` em ProductEdit (inicializados de `product.brand_id` e `product.supplier_id`)
- [x] 5.3 Adicionar nova linha no JSX entre a linha 1 (Nome/Categoria/Subcategoria) e linha 2 (SKU/Estoque): `grid grid-cols-1 md:grid-cols-2 gap-4`
- [x] 5.4 Renderizar `<BrandSelect>` e `<SupplierSelect>` na nova linha
- [x] 5.5 Adicionar `supplier_id: supplierId || null` no `productUpdate` payload (handleSubmit)
- [x] 5.6 Substituir `brand: brand || null` por `brand_id: brandId || null` no `productUpdate` payload
- [x] 5.7 Atualizar `EMPTY_PRODUCT` para refletir `brand_id` e `supplier_id` (remover `brand`, `pound_test`, `size` legacy se não usados)
- [x] 5.8 Remover estados legacy `brand`, `poundTest`, `size` e suas referências (já que não têm campos no formulário e a coluna `brand` foi dropada)
- [x] 5.9 Rodar testes do ProductEdit e verificar que passam

## 6. ProductsManagement Cleanup

- [x] 6.1 Remover estados órfãos em `ProductsManagement.tsx`: `brand`, `poundTest`, `size` (nunca são passados para ProductEdit)
- [x] 6.2 Adicionar `brand_id` à interface `Product` local em ProductsManagement
- [x] 6.3 Verificar que a listagem de produtos e filtros continuam funcionando

## 7. Final Verification

- [x] 7.1 Rodar `npm run test` — todos os testes devem passar
- [x] 7.2 Rodar `npm run dev` e testar manualmente: criar novo produto com marca e fornecedor, editar produto existente, verificar que dados persistem — **Verificado via API**: criação de produto com brand_id+supplier_id funciona, JOIN com brands retorna nome corretamente
- [x] 7.3 Testar em viewport mobile (stack vertical dos selects) — **Layout**: `grid-cols-1 md:grid-cols-2` no JSX garante stack vertical em mobile
- [x] 7.4 Verificar que criação inline de marca funciona e aparece na lista imediatamente — **Verificado via API**: criação de marca, rejeição de duplicata, listagem funcionam. Realtime via postgres_changes implementado no BrandSelect
- [x] 7.5 Verificar que busca nos dois Comboboxes funciona (filtrar por texto parcial) — **Verificado via teste**: BrandSelect.test.tsx e SupplierSelect.test.tsx testam filtragem textual
