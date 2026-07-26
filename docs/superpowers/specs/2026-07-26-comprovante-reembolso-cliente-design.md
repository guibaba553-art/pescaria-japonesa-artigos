# Spec: Comprovante de Reembolso na Tela de Acompanhamento do Cliente

**Data:** 2026-07-26
**Status:** Aprovado

## Resumo

Permitir que o cliente visualize o comprovante de reembolso na tela de acompanhamento de pedidos (`/conta`), com um novo status visual `reembolsado`, modal de detalhes, link para o comprovante oficial da operadora (quando disponível) e exportação em PDF.

## Motivação

Hoje, quando um pedido é reembolsado, o status vai para `cancelado` e o cliente vê apenas um card genérico "Pedido cancelado". Não há indicação de que o valor foi estornado, nem comprovante do reembolso. A tabela `payment_refunds` tem RLS restrito a admin/employee — clientes não conseguem consultar seus próprios reembolsos.

## Escopo

### 1. Novo status `reembolsado`

#### 1.1 Tipo e configuração

- Adicionar `reembolsado` ao tipo `OrderStatus` em:
  - `src/lib/orderStatus.ts` (tipo + `statusConfig`)
  - `src/components/OrderTrackingTimeline.tsx` (tipo)
- Configuração visual:
  - `label`: `"Reembolsado"`
  - `icon`: `Undo2` (lucide-react)
  - `badgeClass`: tom verde (positivo — dinheiro devolvido)
  - `accentClass`: `border-l-green-600`

#### 1.2 Transições de status (DB)

Adicionar `reembolsado` como estado final na função `validate_order_status_transition()` (trigger do banco). Transições permitidas de entrada:

| De | Para |
|----|------|
| `em_preparo` | `reembolsado` |
| `pronto_retirada` | `reembolsado` |
| `enviado` | `reembolsado` |
| `entregado` | `reembolsado` |
| `retirado` | `reembolsado` |

`reembolsado` é estado final — não permite novas transições de saída.

### 2. Card de reembolso na timeline

#### 2.1 `OrderTrackingTimeline`

Quando `status === 'reembolsado'`, substituir toda a barra de progresso por um card de reembolso (Opção A):

```
┌──────────────────────────────────────────────────┐
│  [↺]  Pedido Reembolsado                         │
│                                                   │
│  R$ 87,90 estornado em 26/07/2026                │
│  Motivo: Produto indisponível                    │
│                                                   │
│  [Ver comprovante]          [Baixar PDF]         │
└──────────────────────────────────────────────────┘
```

- Card com fundo verde claro (`bg-emerald-500/5`, borda `border-emerald-500/20`)
- Ícone circular `Undo2` com fundo `bg-emerald-500/10`
- Valor formatado em BRL
- Data formatada em `pt-BR`
- Motivo truncado em 1 linha com tooltip/expand se longo

#### 2.2 Props adicionais

Novas props no `OrderTrackingTimelineProps`:
```ts
refundAmount?: number;
refundDate?: string;
refundReason?: string;
refundId?: string;
gateway?: 'asaas' | 'mercadopago';
transactionReceiptUrl?: string;
```

### 3. Modal de comprovante

#### 3.1 `RefundReceiptDialog`

Novo componente `src/components/RefundReceiptDialog.tsx`:

**Conteúdo:**
| Campo | Fonte |
|-------|-------|
| Nº do pedido | `order.id` |
| Valor reembolsado | `refund.amount` |
| Data do reembolso | `refund.created_at` |
| Método de pagamento original | `order.payment_method` |
| ID da transação | `refund.gateway_refund_id` |
| Motivo | `refund.reason` |
| Status | `refund.status` |

**Link discreto no rodapé:**
- Mostrar apenas quando `gateway === 'asaas'` e `transactionReceiptUrl` existe
- Texto: "Visualizar no site da operadora de pagamento"
- Abre em nova aba

**Botão "Baixar PDF":**
- Gera e faz download do PDF de comprovante

### 4. PDF de comprovante

Usar `jspdf` para gerar um PDF simples:

- Cabeçalho: logo da loja + "Comprovante de Reembolso"
- Tabela com os dados do reembolso
- Rodapé: data de emissão + "Emitido por JapasPesca"
- Nome do arquivo: `comprovante-reembolso-{orderId.slice(0,8)}.pdf`

### 5. Edge Function: `get-order-refund`

**Rota:** `POST /functions/v1/get-order-refund`
**Auth:** Cliente autenticado (dono do pedido)
**Input:** `{ orderId: string }`
**Output:** Dados do reembolso (primeiro registro aprovado de `payment_refunds` para o pedido) + URL do recibo oficial do Asaas (extraída do `gateway_response.transactionReceiptUrl`)

**Segurança:**
- Verifica se `order.user_id === authenticated_user.id`
- Não altera RLS da `payment_refunds` — apenas expõe via edge function com verificação de propriedade

### 6. Ajustes nas Edge Functions de reembolso

As funções abaixo passam a setar `status = 'reembolsado'` (em vez de `cancelado`) quando o reembolso é efetuado com sucesso:

| Função | Arquivo | Condição |
|--------|---------|----------|
| `refund-payment` | `supabase/functions/refund-payment/index.ts` | Após criar refund no gateway e inserir em `payment_refunds` |
| `cancel-order` | `supabase/functions/cancel-order/index.ts` | Após criar refund no gateway e inserir em `payment_refunds` |
| `payment-webhook` | `supabase/functions/payment-webhook/index.ts` | Auto-refund por falha de estoque |
| `asaas-webhook` | `supabase/functions/asaas-webhook/index.ts` | Evento `PAYMENT_REFUNDED` (reembolso manual no dashboard Asaas) |

**Nota:** O status `cancelado` continua existindo para cancelamentos sem reembolso (ex: prazo expirado sem pagamento, cancelado pelo admin sem estorno). Apenas pedidos que tiveram estorno efetivo recebem `reembolsado`.

### 7. Integração na página Account

#### 7.1 Query de pedidos

Estratégia em duas camadas:

1. **Query principal:** incluir `refunded_amount` e `cancellation_reason` (já presentes na tabela `orders`) na query de pedidos para exibição imediata no card de reembolso, sem chamada extra.
2. **Sob demanda:** ao abrir o modal de comprovante, chamar a edge function `get-order-refund` para buscar os detalhes completos (ID gateway, status, URL do recibo oficial).

#### 7.2 Tipo Order

Adicionar ao tipo local em `Account.tsx`:
```ts
refunded_amount?: number;
is_refunded?: boolean;
```

### 8. Gateway: diferenças Asaas vs Mercado Pago

| Funcionalidade | Asaas | Mercado Pago |
|---------------|-------|-------------|
| ID do reembolso | `gateway_refund_id` | `gateway_refund_id` |
| Dados do reembolso | `gateway_response` (JSONB) | `gateway_response` (JSONB) |
| URL do comprovante | `gateway_response.transactionReceiptUrl` | Não disponível |
| Link externo no modal | Mostrar | Omitir |

## Fora de escopo

- Reembolso parcial (o sistema atual já trata, mas o card exibe apenas o valor total reembolsado)
- Notificação por email de reembolso (já existe o template `order-cancelled`, mas não será alterado neste escopo)
- Histórico de múltiplos reembolsos no mesmo pedido (exibe apenas o primeiro)

## Arquivos afetados

| Arquivo | Tipo de mudança |
|---------|-----------------|
| `src/lib/orderStatus.ts` | Adicionar `reembolsado` ao tipo e config |
| `src/components/OrderTrackingTimeline.tsx` | Novo card de reembolso + tipo + props |
| `src/components/RefundReceiptDialog.tsx` | **Novo** — modal de comprovante |
| `src/pages/Account.tsx` | Integrar card, modal e chamada à edge function |
| `supabase/functions/get-order-refund/index.ts` | **Nova** — edge function |
| `supabase/functions/refund-payment/index.ts` | Status `reembolsado` |
| `supabase/functions/cancel-order/index.ts` | Status `reembolsado` |
| `supabase/functions/payment-webhook/index.ts` | Status `reembolsado` |
| `supabase/functions/asaas-webhook/index.ts` | Status `reembolsado` |
| `supabase/migrations/` | **Nova** — trigger de transição + status |
