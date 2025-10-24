# Arquitetura do Projeto - Loja de Pesca JAPA

## 📁 Estrutura de Diretórios

```
src/
├── components/          # Componentes React reutilizáveis
│   ├── ui/             # Componentes de UI base (shadcn)
│   ├── Cart.tsx        # Carrinho de compras
│   ├── Checkout.tsx    # Processo de checkout
│   ├── ProductCard.tsx # Card de produto
│   ├── ProductEdit.tsx # Edição de produto (Admin)
│   ├── ProductVariations.tsx         # Gerenciamento de variações
│   ├── ProductVariationSelector.tsx  # Seletor de variações (Cliente)
│   └── ...
│
├── hooks/              # React Hooks personalizados
│   ├── useAuth.tsx            # Autenticação
│   ├── useCart.tsx            # Gerenciamento do carrinho
│   ├── useProductQuantity.tsx # Controle de quantidade
│   └── useProductVariations.tsx # Gerenciamento de variações (NOVO)
│
├── pages/              # Páginas da aplicação
│   ├── Index.tsx       # Home page
│   ├── Products.tsx    # Listagem de produtos
│   ├── ProductDetails.tsx # Detalhes do produto
│   ├── Admin.tsx       # Painel administrativo
│   ├── Account.tsx     # Conta do usuário
│   └── Auth.tsx        # Login/Cadastro
│
├── utils/              # Funções utilitárias
│   ├── validation.ts         # Validações gerais (CEP, CPF)
│   ├── productValidation.ts  # Validações de produtos (NOVO)
│   ├── productHelpers.ts     # Helpers de produtos (NOVO)
│   └── removeBackground.ts   # Remoção de fundo de imagem
│
├── types/              # Definições de tipos TypeScript
│   └── product.ts      # Tipos relacionados a produtos
│
├── config/             # Configurações da aplicação
│   └── constants.ts    # Constantes globais
│
└── integrations/       # Integrações externas
    └── supabase/       # Cliente e tipos Supabase
```

## 🔧 Componentes Principais

### Gerenciamento de Produtos

#### ProductEdit.tsx
- **Responsabilidade**: Edição completa de produtos no painel admin
- **Hooks utilizados**: `useProductVariations`, `useToast`
- **Funcionalidades**:
  - Upload de múltiplas imagens
  - Edição de dados básicos (nome, preço, estoque)
  - Gerenciamento de variações
  - Configuração de promoções
  - Geração de resumo com IA

#### ProductVariations.tsx
- **Responsabilidade**: Interface para adicionar/editar variações
- **Uso**: Compartilhado entre ProductEdit e Admin
- **Funcionalidades**:
  - Adicionar nova variação
  - Editar variações existentes
  - Remover variações
  - Validação em tempo real

### Carrinho e Checkout

#### Cart.tsx
- **Responsabilidade**: Exibição e gerenciamento do carrinho
- **Hook**: `useCart`
- **Funcionalidades**:
  - Adicionar/remover itens
  - Ajustar quantidades
  - Calcular subtotal e total
  - Cálculo de frete

#### Checkout.tsx
- **Responsabilidade**: Processo de finalização de compra
- **Integrações**: Mercado Pago (PIX, cartão)
- **Funcionalidades**:
  - Seleção de método de pagamento
  - Validação de dados de cartão
  - Geração de QR Code PIX
  - Processamento de pagamento

## 🪝 Hooks Personalizados

### useProductVariations
**Arquivo**: `src/hooks/useProductVariations.tsx`

**Propósito**: Centralizar toda lógica de CRUD de variações de produtos

**Métodos**:
```typescript
{
  variations: ProductVariation[]     // Estado atual das variações
  loading: boolean                   // Estado de carregamento
  loadVariations(id?: string)        // Carregar do banco
  saveVariations(productId, vars)    // Salvar com segurança
  addVariation(variation)            // Adicionar localmente
  updateVariation(id, updates)       // Atualizar localmente
  removeVariation(id)                // Remover localmente
  resetVariations()                  // Limpar estado
}
```

**Proteções**:
- ✅ Valida estado antes de deletar variações
- ✅ Logs detalhados para debug
- ✅ Tratamento de erros robusto
- ✅ Evita perda de dados por erro de carregamento

### useCart
**Arquivo**: `src/hooks/useCart.tsx`

**Propósito**: Gerenciar estado do carrinho com persistência local

**Métodos**:
```typescript
{
  items: CartItem[]              // Itens no carrinho
  total: number                  // Total calculado
  itemCount: number              // Quantidade total de itens
  addItem(product, quantity)     // Adicionar produto
  removeItem(id)                 // Remover produto
  updateQuantity(id, quantity)   // Atualizar quantidade
  clearCart()                    // Limpar carrinho
}
```

**Validações**:
- Quantidade mínima: 1
- Quantidade máxima: 100 por item
- Persistência em localStorage

## 🛠️ Utilitários

### productValidation.ts
**Arquivo**: `src/utils/productValidation.ts`

**Funções**:
- `validateProductForm(data)` - Valida formulário completo de produto
- `validateVariation(variation)` - Valida uma variação individual
- `validateQuantity(qty, max)` - Valida quantidade para carrinho
- `validateReviewComment(comment)` - Valida comentário de avaliação

**Retorno padronizado**:
```typescript
{
  isValid: boolean
  error?: string
  adjustedValue?: any
}
```

### productHelpers.ts
**Arquivo**: `src/utils/productHelpers.ts`

**Funções úteis**:
- `formatPrice(price)` - Formata preço em R$
- `calculateDiscountPercentage(original, sale)` - Calcula desconto
- `isPromotionActive(saleEndsAt)` - Verifica se promoção está ativa
- `getFinalPrice(...)` - Calcula preço final com promoção
- `isLowStock(stock)` - Detecta estoque baixo
- `isOutOfStock(stock)` - Detecta esgotado
- `getStockStatusMessage(stock)` - Gera mensagem de status
- `calculatePixPrice(total, discount)` - Calcula desconto PIX
- `generateSlug(name)` - Gera slug para URLs

## 📊 Fluxo de Dados

### Criação de Produto (Admin)
```
Admin.tsx
  ↓ (preenche formulário)
validateProductForm() ← productValidation.ts
  ↓ (valida dados)
Supabase.insert() ← products table
  ↓ (cria produto)
saveVariations() ← useProductVariations
  ↓ (salva variações)
loadProducts() ← atualiza lista
```

### Edição de Produto (Admin)
```
ProductEdit.tsx
  ↓ (abre dialog)
loadVariations() ← useProductVariations
  ↓ (carrega variações)
[usuário edita]
  ↓ (salva)
saveVariations() ← valida e salva
  ↓
[sucesso] toast + refresh
```

### Compra de Produto (Cliente)
```
ProductDetails.tsx
  ↓ (seleciona variação)
ProductVariationSelector
  ↓ (define quantidade)
ProductQuantitySelector
  ↓ (adiciona ao carrinho)
useCart.addItem()
  ↓ (localStorage)
Cart.tsx
  ↓ (finalizar compra)
Checkout.tsx
  ↓ (processa pagamento)
Mercado Pago API
```

## 🗄️ Banco de Dados

### Tabelas Principais

**products**
- Dados básicos do produto
- Imagens, preços, estoque
- Flags de promoção e destaque

**product_variations**
- Variações de um produto
- Preço e estoque individuais
- Relacionamento: product_id → products.id

**orders**
- Pedidos dos clientes
- Status, valor total, frete
- Informações de pagamento

**order_items**
- Itens de cada pedido
- Relacionamento: order_id → orders.id
- Preço no momento da compra

**reviews**
- Avaliações de produtos
- Rating de 1-5 estrelas
- Comentários dos clientes

## 🔐 Segurança

### Row Level Security (RLS)

**products**: Leitura pública, escrita apenas admin/employee
**product_variations**: Leitura pública, escrita apenas admin/employee
**orders**: Usuário vê apenas seus pedidos, admin/employee vê tudo
**order_items**: Acesso vinculado ao pedido
**reviews**: Usuário cria/edita apenas suas próprias

### Validações em Camadas

1. **Frontend**: Validação imediata (UX)
2. **Hooks**: Lógica de negócio
3. **Backend**: RLS policies (segurança)

## 🚀 Boas Práticas

### Ao Adicionar Nova Funcionalidade

1. **Tipos primeiro**: Defina tipos em `src/types/`
2. **Validação**: Adicione em `productValidation.ts`
3. **Helpers**: Funções puras em `productHelpers.ts`
4. **Hook**: Lógica com estado em `src/hooks/`
5. **Componente**: UI usando hooks e helpers
6. **Teste**: Verifique fluxo completo

### Padrões de Código

- ✅ Use hooks personalizados para lógica reutilizável
- ✅ Centralize validações em arquivos dedicados
- ✅ Adicione logs para debug (console.log com contexto)
- ✅ Trate erros com mensagens amigáveis
- ✅ Valide dados antes de operações críticas
- ✅ Use tipos TypeScript rigorosos

### Modificações Comuns

**Adicionar campo a produto**:
1. Atualizar tipo em `src/types/product.ts`
2. Adicionar campo no formulário
3. Atualizar validação
4. Atualizar queries Supabase

**Nova validação**:
1. Adicionar função em `productValidation.ts`
2. Usar nos componentes necessários
3. Adicionar testes (manual)

**Novo helper**:
1. Adicionar em `productHelpers.ts`
2. Exportar função
3. Importar onde necessário

## 📝 Convenções

### Nomenclatura
- **Componentes**: PascalCase (ProductCard.tsx)
- **Hooks**: camelCase com prefixo "use" (useProductVariations)
- **Tipos**: PascalCase (ProductVariation)
- **Funções**: camelCase (validateProductForm)
- **Constantes**: UPPER_SNAKE_CASE (PRODUCT_CATEGORIES)

### Imports
```typescript
// 1. Bibliotecas externas
import { useState } from 'react';

// 2. Componentes UI
import { Button } from '@/components/ui/button';

// 3. Componentes locais
import { ProductCard } from '@/components/ProductCard';

// 4. Hooks
import { useCart } from '@/hooks/useCart';

// 5. Utils
import { validateProductForm } from '@/utils/productValidation';

// 6. Tipos
import { Product } from '@/types/product';
```

## 🐛 Debug

### Logs Importantes
- `useProductVariations`: Logs detalhados de operações CRUD
- `ProductEdit/Admin`: Logs de salvamento de produtos
- `Checkout`: Logs de processamento de pagamento

### Ferramentas
- Console do navegador (logs)
- Network tab (requisições)
- Supabase Dashboard (banco de dados)
- React DevTools (estado)

## 📚 Referências

- [Documentação Supabase](https://supabase.com/docs)
- [Shadcn UI](https://ui.shadcn.com/)
- [React Hook Form](https://react-hook-form.com/)
- [Mercado Pago](https://www.mercadopago.com.br/developers/pt)
