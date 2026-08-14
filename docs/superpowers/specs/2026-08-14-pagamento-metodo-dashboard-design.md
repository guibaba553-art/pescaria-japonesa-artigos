# Exibir forma de pagamento escolhida no dashboard de pedidos

**Data:** 2026-08-14
**Status:** Aprovado pelo usuário

## Problema

No dashboard `/admin/pedidos`, o campo "Pagamento:" mostra "—" para pedidos
`aguardando_pagamento` quando a forma de pagamento escolhida pelo cliente nunca
foi gravada no pedido. Isso acontece quando o pagamento não foi iniciado (ex.:
cartão recusado, falha na geração do PIX, fluxo abandonado).

## Causa raiz

O pedido é criado em `src/pages/CheckoutEntrega.tsx` (INSERT em `orders`) **sem**
`payment_method` nem `payment_gateway`. Esses campos só são gravados depois pelas
edge functions de pagamento (`create-mercadopago-pix`, `create-asaas-pix`,
`create-payment`). Se o pagamento nunca é iniciado, ficam `NULL`.

## Verificação (fatos confirmados no código)

- `selectPixGateway(total)` (`src/lib/pixGatewayRouter.ts`) decide o gateway do
  PIX **antes** da criação do pedido, no mesmo fluxo do checkout
  (`CheckoutEntrega.tsx:634`). Não é estimativa: é a mesma decisão que escolhe a
  edge function chamada logo depois.
- Cartão (crédito/débito) → gateway sempre `asaas` (AGENTS.md: "Asaas (card)").
- `refresh-pix` respeita o `payment_gateway` já gravado no pedido (não re-roteia).
- O dashboard já renderiza "Pagamento:" a partir de `payment_method` +
  `payment_gateway` (`OrdersManagement.tsx:610-616`): "PIX via Asaas",
  "Cartão de Crédito via Asaas", etc.

## Solução

Gravar `payment_method` e `payment_gateway` no INSERT do pedido em
`CheckoutEntrega.tsx` (passo 3, criação do pedido):

- `payment_method`: `selectedPayment === 'pix' ? 'pix' : 'credit_card'`
- `payment_gateway`:
  - PIX → `selectPixGateway(total + displayFreteValor)` (mesmo valor usado na
    chamada seguinte do checkout)
  - cartão → `'asaas'`

### Fora de escopo

- Nenhuma alteração no dashboard (já exibe os campos corretamente).
- Nenhuma alteração nas edge functions (sobrescrevem com valores idênticos).
- Sem backfill de pedidos antigos (não é possível recuperar método de pagamentos
  nunca iniciados).

## Testes (TDD)

Em `src/pages/__tests__/CheckoutEntrega.test.tsx` (arquivo existente):

1. PIX selecionado → INSERT contém `payment_method: 'pix'` e
   `payment_gateway` igual a `selectPixGateway(total)`.
2. Cartão selecionado → INSERT contém `payment_method: 'credit_card'` e
   `payment_gateway: 'asaas'`.

## Critérios de aceite

- Pedido `aguardando_pagamento` com PIX escolhido → dashboard mostra
  "PIX via Asaas" ou "PIX via Mercado Pago" (por valor), mesmo não pago.
- Pedido `aguardando_pagamento` com cartão escolhido → dashboard mostra
  "Cartão de Crédito via Asaas", mesmo não pago.
- Testes passam: `npm test` e `npm run lint`.
