## Context

O formulário `ProductEdit` (usado para criar e editar produtos, tanto web quanto mobile via Dialog) não expõe campos de marca e fornecedor. A coluna `products.supplier_id` (FK → suppliers) existe no banco mas nunca foi integrada ao formulário. O campo `products.brand` é um TEXT livre sem curadoria — e seus inputs visíveis foram removidos do JSX em algum momento (o state existe, mas os campos `<Input>` não estão no template).

Fornecedores já são gerenciados via `SuppliersManagement` na aba "Fornecedores" do catálogo (`AdminCatalog`). O padrão de select com criação inline já existe no `SubcategorySelect`.

## Goals / Non-Goals

**Goals:**
- Adicionar selects de Marca (com criação inline) e Fornecedor (com busca) ao `ProductEdit`
- Criar tabela `brands` com modelo relacional adequado, migrando dados existentes
- Manter consistência visual e de UX com o padrão existente (`SubcategorySelect` + shadcn Combobox)
- Suportar layout responsivo (2 colunas desktop, empilhado mobile)

**Non-Goals:**
- Gerenciamento completo de marcas (editar/excluir marcas existentes) — criação inline apenas
- Adicionar/restaurar campos de `pound_test` e `size` no formulário
- Criar tela dedicada de gestão de marcas no admin

## Decisions

### 1. Brands: tabela própria com FK

**Decisão**: Criar tabela `brands(id, name UNIQUE)` e substituir `products.brand TEXT` por `products.brand_id UUID FK`.

**Alternativas consideradas**:
- **Reusar `categories`**: Sujaria a semântica de categorias e misturaria concerns.
- **Distinct query em `products.brand`**: Sem constraints, permite duplicatas por typos, sem rename/edit futuro.
- **Manter TEXT + criar tabela**: Dois sources of truth, propenso a inconsistência.

**Rationale**: Tabela própria é o modelo relacional correto, permite constraints de unicidade, e habilita features futuras (logo, metadata, etc).

### 2. Componentes de select: Combobox (Popover + Command)

**Decisão**: Ambos os selects usam o padrão Combobox do shadcn (`Popover` + `Command` do cmdk) em vez do `Select` nativo do Radix.

**Alternativas consideradas**:
- **Radix Select com type-to-search nativo**: Já usado no `SubcategorySelect`, mas a busca é limitada (só primeira letra). O requisito pede busca textual completa.
- **Input + lista filtrada custom**: Mais código, menos acessível, foge do design system.

**Rationale**: `Command` (cmdk) já está instalado no projeto (`src/components/ui/command.tsx`), é o padrão shadcn para searchable selects, e oferece busca fuzzy + acessibilidade built-in.

### 3. BrandSelect: Combobox + "+" button

**Decisão**: O `BrandSelect` combina um `Combobox` (para selecionar/ buscar marcas) com um `Button` ao lado (ícone "+") que abre um `Dialog` de criação. Layout: `flex gap-2`.

**Rationale**: Mesmo padrão visual do `SubcategorySelect` (Select + "+"), substituindo Select por Combobox para ter busca. Mantém consistência de UX.

### 4. SupplierSelect: Combobox standalone

**Decisão**: `SupplierSelect` é um `Combobox` puro, sem botão extra. O trigger mostra `nome_fantasia || razao_social`. Filtra apenas `is_active = true`.

**Rationale**: Fornecedores não precisam de criação inline (já são gerenciados em outra tela). A busca por nome fantasia cobre o caso de uso.

### 5. Data loading nos componentes

**Decisão**: Cada componente (`BrandSelect`, `SupplierSelect`) faz seu próprio fetch de dados via Supabase, com cache e realtime subscription.

**Alternativas consideradas**:
- **Hook compartilhado**: Menos duplicação de código, mas adiciona indireção. Se o padrão se repetir, extrair depois.
- **Props do parent (ProductEdit passa a lista)**: ProductEdit já tem ~2000 linhas. Manter data loading nos componentes mantém o escopo isolado.

**Rationale**: Isolamento de responsabilidade. Componentes são self-contained, facilitando testes e reuso futuro. Segue o padrão do `SubcategorySelect` (usa `useCategories`).

### 6. Migração: create → backfill → add FK → drop

**Ordem**:
1. `CREATE TABLE brands` (com trigger, RLS)
2. `INSERT INTO brands SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND brand != ''`
3. `ALTER TABLE products ADD COLUMN brand_id UUID REFERENCES brands(id) ON DELETE SET NULL`
4. `UPDATE products SET brand_id = brands.id FROM brands WHERE products.brand = brands.name`
5. `ALTER TABLE products DROP COLUMN brand`
6. `CREATE INDEX ON products(brand_id) WHERE brand_id IS NOT NULL`

**Rationale**: Ordem segura — a tabela e os dados existem antes do FK ser adicionado. O DROP é o último passo, depois de confirmar que o backfill funcionou.

## Risks / Trade-offs

- **[Risk] Dados existentes em `products.brand` com nomes inconsistentes** (ex: "Shimano" vs "shimano") → **Mitigation**: O `INSERT ... SELECT DISTINCT` tratará case-sensitive diferente. Se houver duplicatas por case, a migração falha na constraint UNIQUE. Solução: normalizar na query de backfill ou tratar manualmente pré-migration.
- **[Risk] Código legado referenciando `product.brand`** → **Mitigation**: Grep por `product.brand` e `.brand` no codebase para identificar todos os pontos de acesso antes da migração. Ajustar types e queries.
- **[Risk] BrandSelect e SupplierSelect duplicam lógica similar** → **Mitigation**: Ambos usam Combobox. Se a duplicação for significativa, extrair um `SearchableSelect` genérico como refatoração futura. Para este change, componentes separados mantêm clareza.
- **[Trade-off] Dois componentes novos + alteração em ProductEdit** → Coordenação entre create e edit mode. ProductEdit já tem complexidade alta (~2000 linhas). A alteração é localizada (nova linha no JSX + 2 estados + payload).

## Open Questions

- Nenhuma no momento — todas as decisões de design foram resolvidas durante a exploração.
