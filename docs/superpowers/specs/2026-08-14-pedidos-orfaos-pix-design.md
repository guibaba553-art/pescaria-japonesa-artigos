# Design — Eliminar pedidos órfãos PIX (timeout + limpeza bloqueada por RLS)

Data: 2026-08-14

## Problema

Pedidos em `aguardando_pagamento` sem `payment_id`/`asaas_payment_id` acumulam em
produção (10 de 13 pendentes no momento). Duas causas raiz:

1. **Bug 2 — Geração de PIX que pendura.** O cliente chama
   `supabase.functions.invoke('create-mercadopago-pix')` sem timeout; o EF tem um
   `setTimeout(30s)` que apenas loga (não aborta). Se o EF demora (cold start,
   MP lento) o usuário fecha a página e o pedido fica órfão: `pix_attempts = 0`,
   sem `payment_id`, sem `qr_code`, sem cancelamento.

2. **Bug 3 — Limpeza de abandonados bloqueada pelo RLS.** As únicas policies de
   UPDATE em `orders` são para admin/employee
   (`20251022122841:55-57`). A limpeza de pedidos abandonados no início do
   checkout (CheckoutEntrega:496-543) e o rollback de falha de ambos os gateways
   (CheckoutEntrega:691-694) são UPDATEs client-side → bloqueados silenciosamente
   para usuários comuns (0 linhas, sem erro).

   Adicional: o cron `cancel-expired-orders` (rede de segurança) aponta para
   `http://127.0.0.1:54321` (URL local) na migração `20260628000000`, portanto
   nunca executa em produção.

## Escopo

- `src/pages/CheckoutEntrega.tsx` — timeout no invoke + rollback/limpeza via EF
- `supabase/functions/create-mercadopago-pix/index.ts` — abort real + (menor)
- `supabase/functions/cancel-checkout-order/index.ts` — reconciliação MP por
  `payment_id`
- `supabase/functions/cleanup-abandoned-orders/index.ts` — **nova** EF
- Migração nova — corrigir cron `cancel-expired-orders` via vault
- Testes Vitest (frontend) e Deno (EF)

Fora de escopo: Bug 1 (checar erro do UPDATE no create-mercadopago-pix) e
reconciliação por `external_reference` — PIX órfão sem `payment_id` expira
sozinho no MP em ~30min sem cobrança.

## Requisito transversal

Qualquer erro reportado ao usuário deve ser com **mensagem amigável** — nunca
expor detalhes técnicos, nomes de edge functions, erros crus dos gateways ou
stack traces. Mensagens em pt-BR, claras e acionáveis, via toast (ex.: "Não foi
possível gerar o PIX. Tente novamente." / "Tivemos um problema ao finalizar seu
pedido. Tente novamente."). Detalhes técnicos ficam apenas em `console.error`.

## Design

### 1. Cliente — timeout e rollback via EF (Bug 2)

**Helper `invokeWithTimeout`** (novo, em `src/utils/` ou local ao checkout):
envolve `supabase.functions.invoke` em `Promise.race` com timeout de **25s**.
O invoke subjacente não é abortado, mas o cliente não fica travado: timeout é
tratado como falha do gateway (mesmo caminho de `pixError`).

Aplicado aos dois invokes de PIX em `handleFinalizeOrder`:
- `create-mercadopago-pix` (primário) e `create-asaas-pix` (fallback)
- timeout/erro no primário → tenta fallback
- **ambos falharem/timeout** → rollback via `invoke('cancel-checkout-order',
  { orderId: createdOrderId })` — **substitui o UPDATE client-side atual
  (691-694) que o RLS bloqueia** — e toast de erro claro "tente novamente".

### 2. EF `create-mercadopago-pix` — abort real

Trocar o `setTimeout(30s)` que só loga (index.ts:17-19) por um `AbortController`
que realmente aborta e responde erro ao cliente (ex.: 504) após ~30s.

### 3. EF `cancel-checkout-order` — reconciliação MP por `payment_id`

Estender a EF existente (já faz ownership check, libera `release_stock_reservation`
e `release_promo_limits`, cancela com service_role):

- Se `order.payment_id` existir (PIX MP criado e salvo antes da falha) → chamar
  `POST https://api.mercadopago.com/v1/payments/{payment_id}/cancellations` com
  `Authorization: Bearer <MERCADO_PAGO_ACCESS_TOKEN>` antes de cancelar o pedido.
- Falha na reconciliação **não bloqueia** o cancelamento do pedido — loga erro.
- Caso sem `payment_id` (timeout antes do save): nada a reconciliar — PIX órfão
  expira sozinho.

### 4. Nova EF `cleanup-abandoned-orders` (Bug 3)

Service_role, autentica JWT do usuário (`supabase.auth.getUser(token)`), userId
vem do JWT (não do body). Substitui as queries client-side do
CheckoutEntrega:496-543, com os **mesmos critérios**:

1. Abandonados: `status = aguardando_pagamento`, `payment_id IS NULL`,
   `asaas_payment_id IS NULL`, com mais de 5 min de idade
   (`created_at < now() - 5min`)
2. Zumbis: `status = aguardando_pagamento`, `asaas_payment_id NOT NULL`,
   com mais de 2h de idade (`created_at < now() - 2h`)

Para cada pedido:
- `rpc('release_stock_reservation', { p_order_id })`
- `rpc('release_promo_limits', { p_items })` (lê `order_items`)
- `update({ status: 'cancelado', cancellation_reason: 'cancelado_pelo_cliente' })`

Retorno: `{ cancelled: string[], failed: { orderId, error }[] }`.

CheckoutEntrega chama `invoke('cleanup-abandoned-orders', {})` no lugar das
queries 496-543. Estratégia de segurança: a EF verifica `user_id` do pedido ===
`user.id` do JWT (defesa em profundidade, embora os critérios já sejam por
usuário na query).

### 5. Migração — corrigir cron `cancel-expired-orders`

Migração nova (nunca editar `20260628000000`):

1. `cron.unschedule('cancel-expired-orders-every-5-min')` (idempotente, com
   EXCEPTION → RAISE NOTICE como nas migrações existentes)
2. Seed idempotente do secret `functions_base_url` no vault:
   `INSERT ... ON CONFLICT DO NOTHING` com default `http://127.0.0.1:54321`
3. `cron.schedule` recriando o job com
   `url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'functions_base_url') || '/functions/v1/cancel-expired-orders'`
   e `x-cron-secret` do vault (padrão da migração `20260512203851`)

**Ação manual única em prod** (SQL Editor do dashboard): atualizar o secret
`functions_base_url` para `https://qiwcngzbpxddowyqaulm.supabase.co`.

Nota: o job `cleanup-old-chat-messages` (`20251022125229`) tem o mesmo problema
(URL local) — for a de escopo, registrar como follow-up.

## Edge cases

- **Corrida timeout × EF**: o cliente cancela em 25s enquanto o EF ainda roda;
  se o EF salvar `payment_id` depois, o `cancel-checkout-order` pode não ver o
  id → PIX fica pendente no MP e expira em ~30min. Aceito (não há cobrança).
- **Reconciliação não bloqueia**: falha ao cancelar no MP não impede o
  cancelamento do pedido.
- **Limpeza não toca pedidos pagos**: critérios exigem `aguardando_pagamento`;
  pedido com `payment_id` recente (ex.: aguardando confirmação webhook) não é
  cancelado.

## Testes (TDD — vermelho primeiro)

**Vitest — `src/pages/__tests__/CheckoutEntrega.test.tsx` (estender):**

1. Invoke primário demora (mock que nunca resolve + fake timers) → timeout →
   fallback é chamado
2. Ambos gateways falham/timeout → `cancel-checkout-order` é invocado com
   `orderId` (e NÃO há UPDATE client-side em `orders`)
3. Limpeza de abandonados → `cleanup-abandoned-orders` é invocado (e não as
   queries client-side)
4. Fluxos felizes existentes (routing MP/Asaas, fallback simples) continuam
   passando

**Deno — `supabase/functions/tests/`:**
5. `cancel_checkout_order_test.ts` (estender): pedido com `payment_id` →
   mock gateway registra chamada a `/v1/payments/{id}/cancellations`; pedido sem
   `payment_id` → não chama MP; falha do MP não bloqueia cancelamento
6. `cleanup_abandoned_orders_test.ts` (novo): cancela abandonados (5min) e
   zumbis asaas (2h); NÃO cancela pedido com payment_id recente; libera reserva
   e promoção; retorna `{ cancelled, failed }`
7. `create_mercadopago_pix_test.ts` (estender): mock MP pendurado além do
   timeout → resposta de erro (não 200 ok)

**Verificação final:** `npm test`, `npm run build`, `npm run lint`,
`npm run test:functions` (com `supabase start`).
