# Cancelled Orders UX Redesign

**Date:** 2026-07-28
**Scope:** Admin panel — aba "Cancelados" (`OrdersManagement.tsx`)
**Goal:** Clareza visual imediata sobre o estado de estorno de cada pedido cancelado, eliminando ambiguidade para o operador.

---

## 1. Sub-tabs dentro de "Cancelados"

Três sub-tabs substituem a lista única atual, com contagem visível em badge:

| Sub-tab | Critério | Cor | Significado |
|---------|----------|-----|-------------|
| **Precisa de estorno** | `payment_gateway` + `payment_id` existem, `refunded_amount < total_amount` | Âmbar | Ação necessária |
| **Sem pagamento** | `payment_gateway` ou `payment_id` ausentes, OU cobrança nunca confirmada | Cinza | Nenhuma ação financeira |
| **Reembolsado** | `status = 'reembolsado'` OU `refunded_amount >= total_amount` | Verde | Resolvido |

A sub-tab ativa filtra a lista. Transições entre sub-tabs são automáticas: ao concluir um estorno, o card migra para "Reembolsado" e o foco da tela segue junto.

---

## 2. Layout do card (Opção 1 — bloco financeiro destacado)

Estrutura base para todos os cards:

```
┌───────────────────────────────────────────────────────────┐
│ [ícone categoria] #id8chars  Status · Sub-status          │
│                              Motivo descritivo             │
│                                                           │
│  Nome do cliente                    R$ valor_total        │
│  CPF                                                      │
│  Data e hora                                              │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ [ícone pgto] Método · Gateway                      │  │
│  │ ID: payment_id  [Abrir no Gateway ↗]               │  │
│  │                                                     │  │
│  │ [ícone status] Estado · valor e label da ação      │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  [Ver detalhes]  [botão de ação se aplicável]             │
└───────────────────────────────────────────────────────────┘
```

### 2.1 🔶 Precisa de estorno

- Borda esquerda: `border-l-amber-500`
- Badge status: "Cancelado · Estorno pendente" (fundo âmbar)
- Badge motivo: label descritivo mapeado de `cancellation_reason`
- Ícone de categoria: ícone específico por tipo
- Bloco financeiro: ⚠️ Pendente · R$ X,XX a estornar
- Botão: "Estornar dinheiro"
- Link: "Abrir na Asaas" ou "Abrir no Mercado Pago"

Exemplo visual:

```
┌───────────────────────────────────────────────────────────┐
│ 🔶 #a1b2c3d4  Cancelado · Estorno pendente                │
│               Cancelado pela loja — "produto com defeito"  │
│                                                           │
│  João Silva                              R$ 189,90        │
│  ***.123.456-**                                           │
│  28/07/2026 14:30                                         │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 💳 Cartão Visa final 1234 · Asaas                   │  │
│  │ ID: pay_8291x...  [Abrir na Asaas ↗]               │  │
│  │                                                     │  │
│  │ ⚠️ Pendente  ·  R$ 189,90 a estornar               │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  [Ver detalhes]  [Estornar dinheiro]                      │
└───────────────────────────────────────────────────────────┘
```

### 2.2 ⬜ Sem pagamento (com cobrança criada mas não confirmada)

- Borda esquerda: `border-l-gray-400`
- Badge status: "Cancelado · Sem cobrança" (fundo cinza)
- Badge motivo: mapeado de `cancellation_reason`
- Bloco financeiro: ⏹ Cobrança não confirmada · estorno não se aplica
- Sem botão de estorno
- Link para o gateway presente

Exemplo visual (PIX não pago):

```
┌───────────────────────────────────────────────────────────┐
│ ⬜ #c3d4e5f6  Cancelado · Sem cobrança                     │
│              PIX não pago no prazo                         │
│                                                           │
│  Maria Oliveira                          R$ 79,90         │
│  ***.456.789-**                                           │
│  27/07/2026 09:15                                         │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 💳 PIX · Mercado Pago                               │  │
│  │ ID: 987654321  [Abrir no Mercado Pago ↗]           │  │
│  │                                                     │  │
│  │ ⏹ Cobrança não confirmada · estorno não se aplica  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  [Ver detalhes]                                           │
└───────────────────────────────────────────────────────────┘
```

### 2.3 ⬜ Sem pagamento (cancelado antes da cobrança)

- Borda esquerda: `border-l-gray-400`
- Badge status: "Cancelado · Sem cobrança" (fundo cinza)
- Bloco financeiro: mensagem explicativa, sem IDs nem link

Exemplo visual:

```
┌───────────────────────────────────────────────────────────┐
│ ⬜ #g7h8i9j0  Cancelado · Sem cobrança                     │
│              Cancelado pela loja                           │
│                                                           │
│  Carlos Souza                            R$ 45,00         │
│  ***.321.654-**                                           │
│  26/07/2026 16:45                                         │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ ⏹ Nenhuma cobrança registrada                      │  │
│  │                                                     │  │
│  │ Pedido cancelado antes da geração do pagamento.     │  │
│  │ Estorno não se aplica.                              │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  [Ver detalhes]                                           │
└───────────────────────────────────────────────────────────┘
```

### 2.4 🟢 Reembolsado

- Borda esquerda: `border-l-emerald-500`
- Badge status: "Reembolsado" (fundo verde)
- Badge motivo: mapeado de `cancellation_reason`
- Bloco financeiro: ✅ Concluído · R$ X,XX estornado
- Botão: "Comprovante de estorno"
- Link: "Abrir na Asaas" ou "Abrir no Mercado Pago"

Exemplo visual:

```
┌───────────────────────────────────────────────────────────┐
│ 🟢 #k1l2m3n4  Reembolsado                                 │
│               Estornado integralmente                      │
│                                                           │
│  Ana Lima                                R$ 230,00        │
│  ***.987.654-**                                           │
│  25/07/2026 11:00                                         │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 💳 Cartão Master final 5678 · Asaas                 │  │
│  │ ID: pay_4827y...  [Abrir na Asaas ↗]               │  │
│  │                                                     │  │
│  │ ✅ Concluído  ·  R$ 230,00 estornado               │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  [Ver detalhes]  [Comprovante de estorno]                 │
└───────────────────────────────────────────────────────────┘
```

---

## 3. Mapeamento de motivos de cancelamento

Cada `cancellation_reason` do banco é mapeado para texto descritivo, ícone e cor:

| `cancellation_reason` | Label exibido | Ícone | Cor |
|------|------|------|------|
| `prazo_expirado` | "PIX não pago no prazo" | `Clock` | Cinza |
| `cancelado_pelo_cliente` | "Cliente desistiu" | `UserX` | Cinza |
| `cancelado_admin` | "Cancelado pela loja" | `Store` | Azul |
| `estorno_total` | "Estornado integralmente" | `CheckCircle` | Verde |
| Qualquer outro (custom) | Texto enviado pelo admin | — | Cinza |

Quando o motivo é custom (admin digitou), o label da categoria aparece seguido do texto custom:

> Cancelado pela loja — "produto com defeito de fábrica"

---

## 4. Links para o gateway

Toda vez que o pedido tiver `payment_gateway` e `payment_id` (ou `asaas_payment_id`), o card exibe um link para a cobrança no respectivo gateway:

| Gateway | URL |
|---------|-----|
| `asaas` | `https://sandbox.asaas.com/payments/{payment_id}` (sandbox) ou `https://www.asaas.com/payments/{payment_id}` (produção) |
| `mercadopago` | `https://www.mercadopago.com.br/payments/{payment_id}` |

Resolução de ambiente (sandbox vs produção): o frontend já tem acesso ao ambiente via config — usar mesma lógica que a edge function `refundGateway.ts`.

O label do link usa o nome real do gateway: "Abrir na Asaas ↗" ou "Abrir no Mercado Pago ↗".

---

## 5. Comportamento do botão de estorno

Fluxo existente mantido (chama edge function `refund-payment`), com melhorias visuais:

1. Botão entra em loading com spinner: "Estornando..."
2. **Sucesso:**
   - Toast: "✅ R$ X,XX estornado com sucesso via [Gateway]"
   - Card migra automaticamente para sub-tab "Reembolsado"
   - Foco da tela acompanha a migração
   - Bloco financeiro: ⚠️ Pendente → ✅ Concluído
   - Borda: âmbar → verde
3. **Falha:**
   - Toast de erro com detalhes
   - Card permanece na sub-tab atual

A fonte primária do `refunded_amount` permanece `payment_refunds` (não `orders.refunded_amount`), já implementado em `loadOrders` (linhas 1196-1216).

---

## 6. Detalhes expandidos ("Ver detalhes")

Conteúdo expandido permanece o existente, com estas adições:

### 6.1 Bloco de reembolso (já existe, linha 900-951)

Mantido e refinado visualmente (tabela em vez de grid inline). Só aparece se houver pagamento.

### 6.2 Histórico de estornos (novo)

Se `refunded_amount > 0`, exibe registros de `payment_refunds`:

```
Histórico de estornos
┌─────────────────────────────────────────────────────────┐
│ 28/07/2026 14:35  R$ 189,90  Aprovado · Asaas            │
│                   ref_as_8291x...  [Ver comprovante]      │
└─────────────────────────────────────────────────────────┘
```

Cada linha: data, valor, status, gateway, ID da transação, link para comprovante.

### 6.3 Conteúdo existente mantido

Itens do pedido, resumo de valores, NF-e, rastreio — sem alterações.

---

## 7. Regras de categoria (classificação do pedido)

Função pura para classificar cada pedido cancelado em uma das 3 sub-tabs:

```typescript
type CancelledCategory = 'needs_refund' | 'no_payment' | 'refunded';

function classifyCancelledOrder(order: Order): CancelledCategory {
  const hasPayment = !!(order.payment_gateway && (order.payment_id || order.asaas_payment_id));
  const refunded = order.refunded_amount ?? 0;
  const total = Number(order.total_amount);

  if (refunded >= total - 0.01 || order.status === 'reembolsado') {
    return 'refunded';
  }
  if (!hasPayment) {
    return 'no_payment';
  }
  return 'needs_refund';
}
```

---

## 8. Implementação

### 8.1 Arquivos a modificar

| Arquivo | O que muda |
|---------|-----------|
| `src/components/OrdersManagement.tsx` | Sub-tabs, novo layout de card, classificação, transição pós-estorno, histórico de estornos |
| `src/lib/orderStatus.ts` | StatusConfig para os 3 sub-estados visuais (não confundir com status do banco) |
| `src/lib/__tests__/orderStatus.test.ts` | Testes para `classifyCancelledOrder` |
| `src/components/__tests__/OrdersManagement.test.tsx` | Testes para renderização das sub-tabs e transições |

### 8.2 O que **não** muda

- Edge functions (`refund-payment`, `cancel-order`, etc.)
- Schema do banco
- Fluxo de estorno (já validado pelos testes existentes)
- `Account.tsx` (conta do cliente)
- `loadOrders` (já busca `payment_refunds` corretamente)

### 8.3 Dependências

- `statusConfig` em `orderStatus.ts` — adicionar entradas visuais para sub-estados
- `lucide-react` — ícones `AlertTriangle`, `UserX`, `ExternalLink` já existem no projeto
- `supabase` — query de `payment_refunds` para o histórico de estornos (feita junto com `loadOrders` ou sob demanda ao expandir)

---

## 9. Testes

### 9.1 Testes unitários

- `classifyCancelledOrder` cobre todos os cenários:
  - Pedido com pagamento e `refunded_amount < total` → `needs_refund`
  - Pedido com pagamento e `refunded_amount >= total` → `refunded`
  - Pedido `status = 'reembolsado'` → `refunded`
  - Pedido sem `payment_gateway` → `no_payment`
  - Pedido sem `payment_id` nem `asaas_payment_id` → `no_payment`
  - Pedido com `refunded_amount = 0`, com pagamento → `needs_refund`

- Mapeamento de `cancellation_reason` → label descritivo

### 9.2 Testes de componente

- Renderização das 3 sub-tabs com contagem correta
- Card "Precisa de estorno" exibe botão "Estornar dinheiro"
- Card "Sem pagamento" **não** exibe botão de estorno
- Card "Reembolsado" exibe "Comprovante de estorno", não "Estornar dinheiro"
- Link externo para gateway aparece quando há `payment_gateway` + `payment_id`
- Link externo **não** aparece quando não há cobrança
- Pós-estorno bem-sucedido: card migra para sub-tab "Reembolsado", foco acompanha
- Motivo custom aparece como subtítulo junto ao label da categoria
