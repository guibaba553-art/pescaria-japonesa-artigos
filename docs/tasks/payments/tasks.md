# Tasks: Integração de Pagamentos — AbacatePay + Asaas

> **Visão:** Implementação
> **Público:** Desenvolvedores
> **Abordagem:** TDD (escrever teste → implementar → verificar)

---

## Guia de Uso

Cada fase contém tarefas no formato:
1. **`[T]`** — Escreva o teste primeiro (test)
2. **`[I]`** — Implemente (implement)
3. **`[V]`** — Verifique se o teste passa (verify)

Sempre execute os testes antes de passar para a próxima tarefa. Se um teste falhar, não prossiga — corrija a implementação até o teste ficar verde.

**Comandos:**
```bash
npm test                    # Executa todos os testes
npm run test:watch          # Modo watch para desenvolvimento
npx vitest run --reporter=verbose  # Testes com detalhamento
```

---

## Fase 0: Setup e Configuração

### 0.1 Conta Asaas Sandbox

- [ ] **0.1.1** Criar conta em [sandbox.asaas.com](https://sandbox.asaas.com)
  - Gerar API Key no painel
  - Anotar `ASAAS_API_KEY` para as variáveis de ambiente
- [ ] **0.1.2** Verificar que tokenização está ativa no sandbox
  - Testar `POST /v3/creditCard/tokenize` com Insomnia/curl
  - Cartão de teste: `4000000000000010`, CVV `123`, data futura
- [ ] **0.1.3** Configurar webhook no sandbox
  - URL: `https://<projeto>.supabase.co/functions/v1/asaas-webhook`
  - Eventos: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_REFUNDED`

### 0.2 Variáveis de Ambiente

- [ ] **0.2.1** Adicionar no `supabase/functions/.env`:
  ```env
  ASAAS_API_KEY=<chave_do_sandbox>
  ASAAS_ENVIRONMENT=sandbox
  ASAAS_WEBHOOK_AUTH_TOKEN=<token_32_a_255_chars>
  ```
- [ ] **0.2.2** Adicionar no `src/config/constants.ts`:
  ```ts
  export const ASAAS_CONFIG = { ... } as const;
  export const PAYMENT_CONFIG = { ... } as const;
  // NOTA: ASAAS_API_KEY NUNCA vai no frontend — apenas nas edge functions
  ```
- [ ] **0.2.3** Configurar header `User-Agent: JapasPesca/1.0.0` em todas as chamadas ao Asaas nas edge functions (obrigatório desde 11/2024)

### 0.3 Tratamento de IP (`remoteIp`)

- [ ] **0.3.1** Criar utilitário que captura o IP real do cliente no frontend (ex: chamada a serviço como `https://api.ipify.org?format=json` ou header enviado pelo Supabase)
- [ ] **0.3.2** Enviar `remoteIp` como campo obrigatório em toda chamada de cartão para o Asaas

---

## Fase 0.5: Correções de Bugs Existentes (AbacatePay)

> 🔴 Bugs críticos descobertos durante a auditoria da integração AbacatePay atual.
> Corrigir **antes** ou **durante** a implementação do Asaas.

### 0.5.1 BUG-001 — HMAC quebrado no webhook (`abacatepay-webhook`)

- [ ] **0.5.1.1 `[T]`** Testar que assinatura HMAC válida é aceita:
  - Gerar assinatura correta com `HMAC-SHA256(body, ABACATEPAY_PUBLIC_KEY)` em Base64
  - Enviar no header `X-Webhook-Signature`
  - Verificar que o webhook processa normalmente (HTTP 200)
- [ ] **0.5.1.2 `[I]`** Corrigir `supabase/functions/abacatepay-webhook/index.ts` linha 19:
  - `crypto.subtle.sign("HMAC", ...)` retorna `Promise<ArrayBuffer>`, não `ArrayBuffer`
  - **Adicionar `await`** antes da chamada:
    ```ts
    // ANTES (quebrado):
    const expectedSigBytes = crypto.subtle.sign("HMAC", key, body);
    // DEPOIS (corrigido):
    const expectedSigBytes = await crypto.subtle.sign("HMAC", key, body);
    ```
  - A função `verifySignature` também precisa se tornar `async`
- [ ] **0.5.1.3 `[V]`** Rodar teste com assinatura real e verificar que passa

### 0.5.2 BUG-002 — `verify-payment` polling só consulta MercadoPago

- [ ] **0.5.2.1 `[T]`** Testar polling AbacatePay:
  - Mock `GET /v2/transparents/check?id={payment_id}` retorna `{ data: { status: "PAID" } }`
  - Verificar que `order.status` é atualizado para `em_preparo`
- [ ] **0.5.2.2 `[T]`** Testar polling com status `PENDING`:
  - Verificar que retorna `{ updated: false, status: "PENDING" }` sem alterar order
- [ ] **0.5.2.3 `[I]`** Modificar `supabase/functions/verify-payment/index.ts`:
  - Adicionar parâmetro `gateway` (`'mercadopago' | 'abacatepay'` — default `'mercadopago'` para compatibilidade)
  - Se `gateway === 'abacatepay'` → `GET https://api.abacatepay.com/v2/transparents/check?id={payment_id}` com header `Authorization: Bearer {ABACATEPAY_API_KEY}`
  - Mapear status: `PAID` → `approved`, `PENDING` → `pending`, `EXPIRED` → `expired`, `CANCELLED` → `cancelled`, `REFUNDED` → `refunded`
- [ ] **0.5.2.4 `[V]`** Verificar ambos os testes passam

### 0.5.3 BUG-003 — Extração de `externalId` incompleta

- [ ] **0.5.3.1 `[T]`** Testar webhook `transparent.completed` com payload real:
  - Payload contém `data.transparent.externalId: "order-uuid"`
  - Verificar que a order é localizada corretamente
- [ ] **0.5.3.2 `[I]`** Corrigir `supabase/functions/abacatepay-webhook/index.ts` linha 80:
  ```ts
  // ANTES:
  const orderId = data?.checkout?.externalId || data?.externalId;
  // DEPOIS:
  const orderId = data?.transparent?.externalId || data?.checkout?.externalId || data?.externalId;
  ```
- [ ] **0.5.3.3 `[V]`** Verificar que o teste passa com o path correto

### 0.5.4 BUG-004 — `platformFee` não salvo

- [ ] **0.5.4.1 `[T]`** Testar que `create-abacatepay-pix` salva `platformFee`:
  - Mock AbacatePay retorna `{ data: { platformFee: 150 } }`
  - Verificar que `UPDATE orders SET platform_fee = 150` é chamado
- [ ] **0.5.4.2 `[I]`** Adicionar migration + código:
  - Migration: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_fee integer;`
  - Em `supabase/functions/create-abacatepay-pix/index.ts`, adicionar `platform_fee: charge.platformFee` no `UPDATE`
- [ ] **0.5.4.3 `[V]`** Verificar que o teste passa

### 0.5.5 BUG-005 — `expiresIn` não configurado (default 1h, ideal 30min)

- [ ] **0.5.5.1 `[I]`** Corrigir `supabase/functions/create-abacatepay-pix/index.ts`:
  - Adicionar `expiresIn: 1800` (30 minutos em segundos) no objeto `data` enviado para AbacatePay
  ```ts
  const body: Record<string, unknown> = {
    method: "PIX",
    data: {
      amount,
      expiresIn: 1800, // 30 minutos
      externalId: orderId,
      ...
    },
  };
  ```
- [ ] **0.5.5.2 `[V]`** Verificar via curl/Insomnia que `expiresAt` retornado é ~30 min no futuro

### 0.5.6 BUG-006 — `receiptUrl` não salvo no webhook

- [ ] **0.5.6.1 `[T]`** Testar que `transparent.completed` salva `receiptUrl`:
  - Payload contém `data.transparent.receiptUrl: "https://app.abacatepay.com/receipt/..."`
  - Verificar que `UPDATE orders SET receipt_url = '...'` é chamado
- [ ] **0.5.6.2 `[I]`** Modificar `supabase/functions/abacatepay-webhook/index.ts`:
  - No case `transparent.completed`, adicionar `receipt_url: data?.transparent?.receiptUrl` no `UPDATE`
  - Migration (se ainda não existir): `ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_url text;`
- [ ] **0.5.6.3 `[V]`** Verificar que o teste passa

### 0.5.7 BUG-007 — Sem idempotência no webhook AbacatePay

- [ ] **0.5.7.1 `[T]`** Testar idempotência:
  - Enviar mesmo evento 2x (mesmo `id` no payload)
  - Verificar que a 1ª chamada processa (HTTP 200)
  - Verificar que a 2ª chamada retorna HTTP 200 mas NÃO processa novamente
- [ ] **0.5.7.2 `[I]`** Implementar deduplicação em `supabase/functions/abacatepay-webhook/index.ts`:
  - Criar tabela `webhook_events` (id, event_id UNIQUE, processed_at) ou usar checagem em memória
  - Antes de processar: `SELECT FROM webhook_events WHERE event_id = payload.id`
  - Se já existe → HTTP 200 sem processar
  - Se não existe → processa → `INSERT INTO webhook_events`
- [ ] **0.5.7.3 `[I]`** Criar migration:
  ```sql
  CREATE TABLE IF NOT EXISTS webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id text UNIQUE NOT NULL,
    event_type text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
  ```
- [ ] **0.5.7.4 `[V]`** Verificar que o teste de duplicação passa

> ✅ **Resumo Fase 0.5:** 7 bugs — 4 críticos/altos (HMAC, polling, externalId, idempotência), 3 médios/baixos (platformFee, expiresIn, receiptUrl). Todos com testes + implementação + verificação.

---

## Fase 1: Migração SQL

### 1.1 Migration: `add_asaas_fields`

- [ ] **1.1.1 `[T]`** Escrever teste de migração:
  - Criar `supabase/migrations/__tests__/2025_asaas_fields.test.sql` (se possível) ou testar manualmente no supabase local
- [ ] **1.1.2 `[I]`** Criar arquivo:
  ```sql
  -- supabase/migrations/YYYYMMDDHHMMSS_add_asaas_fields.sql
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS asaas_customer_id text;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS asaas_payment_id text;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_gateway text;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_attempts integer DEFAULT 0;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_payment_attempt_at timestamptz;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_due_at timestamptz;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_fee integer;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_url text;
  ALTER TABLE saved_payment_methods ADD COLUMN IF NOT EXISTS asaas_credit_card_token text;
  CREATE INDEX IF NOT EXISTS idx_orders_pending_payment ON orders (status, created_at) WHERE status = 'aguardando_pagamento';

  -- Tabela para idempotência de webhooks (BUG-007)
  CREATE TABLE IF NOT EXISTS webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id text UNIQUE NOT NULL,
    event_type text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
  ```
- [ ] **1.1.3 `[V]`** Executar migration no supabase local e verificar colunas

---

## Fase 1.5: Módulo Compartilhado `_shared/asaasCustomer.ts`

### 1.5.1 Implementar `findOrCreateCustomer`

- [ ] **1.5.1.1 `[T]`** Testar criação de customer:
  - Mock `POST /v3/customers` retorna `{ "id": "cus_123" }`
  - Verificar que envia `name`, `cpfCnpj`, `email`, `phone`
  - Verificar que envia header `User-Agent` obrigatório
  - Verificar que salva `asaas_customer_id` no `profiles`
- [ ] **1.5.1.2 `[T]`** Testar customer existente:
  - `profiles.asaas_customer_id` já preenchido
  - `GET /v3/customers/{id}` retorna sucesso → usar existente, sem criar
- [ ] **1.5.1.3 `[T]`** Testar customer existente mas deletado no Asaas:
  - `profiles.asaas_customer_id` preenchido
  - `GET /v3/customers/{id}` retorna `404`
  - Deve criar novo customer e atualizar `profiles.asaas_customer_id`
- [ ] **1.5.1.4 `[I]`** Criar `supabase/functions/_shared/asaasCustomer.ts`:
  ```ts
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

  interface CustomerData {
    name: string;
    email: string;
    cpfCnpj: string;
    phone: string;
  }

  export async function findOrCreateCustomer(
    supabase: ReturnType<typeof createClient>,
    userId: string,
    data: CustomerData,
    asaasApiKey: string,
  ): Promise<{ id: string; created: boolean }> {
    // 1. Busca asaas_customer_id no profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('asaas_customer_id')
      .eq('id', userId)
      .single();

    // 2. Se existe, revalida no Asaas
    if (profile?.asaas_customer_id) {
      const resp = await fetch(
        `https://sandbox.asaas.com/api/v3/customers/${profile.asaas_customer_id}`,
        { headers: { 'access_token': asaasApiKey } }
      );
      if (resp.ok) {
        const existing = await resp.json();
        return { id: existing.id, created: false };
      }
      // Se 404, o customer foi deletado — criar novo
    }

    // 3. Criar novo customer
    const resp = await fetch('https://sandbox.asaas.com/api/v3/customers', {
      method: 'POST',
      headers: {
        'access_token': asaasApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: data.name,
        cpfCnpj: data.cpfCnpj,
        email: data.email,
        phone: data.phone,
        notificationDisabled: true,
      }),
    });

    const customer = await resp.json();
    if (!resp.ok) throw new Error(`Erro ao criar customer Asaas: ${customer.errors?.[0]?.description}`);

    // 4. Salvar ID no profile
    await supabase
      .from('profiles')
      .update({ asaas_customer_id: customer.id })
      .eq('id', userId);

    return { id: customer.id, created: true };
  }
  ```

---

## Fase 2: Edge Function `create-payment-asaas`

### 2.1 Lógica de Customer Asaas (via módulo compartilhado)

- [ ] **2.1.1 `[T]`** Testar integração com `_shared/asaasCustomer.ts`:
  - Mock `findOrCreateCustomer` retorna `{ id: "cus_123", created: true }`
  - Verificar que a função é chamada com os parâmetros corretos
- [ ] **2.1.2 `[I]`** Importar e usar `findOrCreateCustomer` do módulo compartilhado:
  ```ts
  import { findOrCreateCustomer } from '../_shared/asaasCustomer.ts';
  
  const customer = await findOrCreateCustomer(supabase, user.id, customerData);
  ```

### 2.2 Validação do Pedido

- [ ] **2.2.1 `[T]`** Testar verificação de autenticação:
  - Request sem JWT → 401
  - Request com JWT inválido → 401
- [ ] **2.2.2 `[T]`** Testar verificação de ownership:
  - Order de outro usuário → 403
- [ ] **2.2.3 `[T]`** Testar validação de valor:
  - `total_amount` da order difere do calculado → 400
- [ ] **2.2.4 `[I]`** Implementar validações no handler principal

### 2.3 Processamento de Pagamento

- [ ] **2.3.1 `[T]`** Testar pagamento aprovado:
  - Mock `POST /v3/payments` retorna HTTP 200 com `{ "id": "pay_123", "status": "CONFIRMED", "creditCardBrand": "VISA", "creditCardNumber": "0010", "creditCardToken": "tok_reutilizavel" }`
  - Verificar que `orders.status` foi atualizado para `em_preparo`
  - Verificar que `orders.asaas_payment_id` foi salvo
  - Verificar que `payment_gateway` é `'asaas'`
- [ ] **2.3.2 `[T]`** Testar pagamento recusado (sem rollback):
  - Mock `POST /v3/payments` retorna HTTP 400
  - Verificar que `orders.status` NÃO mudou
  - Verificar que `payment_attempts` foi incrementado
  - Verificar que `last_payment_attempt_at` foi atualizado
- [ ] **2.3.3 `[T]`** Testar `saveCard=true` com pagamento aprovado:
  - Verificar que resposta inclui `cardInfo.creditCardToken`
  - Verificar que `creditCardToken` é o mesmo retornado pela API
- [ ] **2.3.4 `[T]`** Testar `saveCard=false`:
  - Verificar que resposta NÃO inclui `cardInfo`
- [ ] **2.3.5 `[I]`** Implementar handler `create-payment-asaas` com roteamento:
  - Autenticar → validar order → customer → criar payment → processar resposta

### 2.4 CORS e Error Handling

- [ ] **2.4.1 `[T]`** Testar OPTIONS → 200 com headers CORS
- [ ] **2.4.2 `[T]`** Testar erro genérico → 500 com mensagem
- [ ] **2.4.3 `[I]`** Implementar CORS e try/catch global

---

## Fase 3: Componente `CreditCardForm.tsx`

### 3.1 Layout e Estados Base

- [ ] **3.1.1 `[T]`** Testar renderização:
  - Renderizar com `savedCards` vazio → exibir "Usar novo cartão" e formulário completo
  - Renderizar com `savedCards` populado → exibir radio group com cartões
- [ ] **3.1.2 `[T]`** Testar alternância entre modos:
  - Clicar em cartão salvo → formulário recolhe, mostra resumo
  - Clicar "Usar novo cartão" → formulário expande
- [ ] **3.1.3 `[T]`** Testar checkbox "Salvar cartão":
  - Default: desmarcado (`saveCard === false`)
  - Clicar: marcado (`saveCard === true`)
- [ ] **3.1.4 `[I]`** Implementar `CreditCardForm.tsx` com:
  - Props tipadas (`CreditCardFormProps`)
  - Estados: `formMode`, `cardNumber`, `holderName`, `expiry`, `cvv`, `saveCard`, `brand`
  - Seletor de cartões salvos (radio group)
  - Formulário de novo cartão com validação
  - Select de parcelamento (até 10x sem juros)

### 3.2 Validação de Campos

- [ ] **3.2.1 `[T]`** Testar validação de número (Luhn):
  - `4242424242424242` → válido, bandeira Visa
  - `5555666677778884` → válido, bandeira Mastercard
  - `1234567890123456` → inválido
- [ ] **3.2.2 `[T]`** Testar validação de validade:
  - `12/30` → válido (futuro)
  - `01/20` → inválido (passado)
  - `13/30` → inválido (mês inexistente)
- [ ] **3.2.3 `[T]`** Testar validação de CVV:
  - `123` → válido
  - `12` → inválido
  - `12345` → inválido
- [ ] **3.2.4 `[T]`** Testar validação de nome:
  - `João Silva` → válido
  - `Jo` → inválido (mín. 3 caracteres)
- [ ] **3.2.5 `[I]`** Implementar validações (funções puras em `src/lib/creditCardValidation.ts`)

### 3.3 Validação de Envio para Edge Function

- [ ] **3.3.1 `[T]`** Testar envio de dados do cartão:
  - `CreditCardForm` coleta `cardNumber`, `holderName`, `expiry`, `cvv`
  - Valida todos os campos antes de submeter
  - Chama `onSubmitCardData` com `CreditCardFormData` + `saveCard`
- [ ] **3.3.2 `[T]`** Testar envio com cartão salvo:
  - Modo `'saved'` → `onSubmitCardData` chamado com `selectedCardId` (não envia dados brutos)
- [ ] **3.3.3 `[T]`** Testar botão desabilitado durante loading:
  - `loading=true` → botão "Finalizar pedido" desabilitado
- [ ] **3.3.4 `[I]`** Implementar fluxo de submissão:
  - `handleSubmit()` → valida → `onSubmitCardData(cardFormData, saveCard)`

### 3.4 Parcelamento

- [ ] **3.4.1 `[T]`** Testar cálculo de parcelas:
  - `total = 150.00` → opções de 1x a 10x (max 10, min R$ 5 por parcela)
  - `total = 7.00` → apenas 1x (min R$ 5)
  - `total = 500.00` → até 10x
- [ ] **3.4.2 `[I]`** Implementar cálculo e select de parcelamento
- [ ] **3.4.3 `[V]`** Verificar integração com `onInstallmentChange`

---

## Fase 4: Modificar `CheckoutEntrega.tsx`

### 4.1 Substituir Seção de Cartão

- [ ] **4.1.1 `[T]`** Testar que `selectedPayment === 'credit_card'` renderiza `CreditCardForm`
- [ ] **4.1.2 `[T]`** Testar que opção "Mercado Pago" não aparece mais
- [ ] **4.1.3 `[T]`** Testar que `onTokenGenerated` e `onInstallmentChange` fluem para o estado do checkout
- [ ] **4.1.4 `[I]`** Substituir bloco de cartão no JSX:
  - Remover lista de cartões salvos antiga
  - Remover referência a `create-abacatepay-checkout`
  - Incluir `<CreditCardForm>` condicionalmente
  - Adicionar estados: `cardToken`, `shouldSaveCard`, `installments`

### 4.2 Atualizar `handleFinalizeOrder` — PIX com Fallback

- [ ] **4.2.1 `[T]`** Testar fluxo PIX bem-sucedido:
  - Mock `create-abacatepay-pix` retorna sucesso
  - Verificar que `PixPaymentDialog` abre com dados corretos
  - Verificar que NÃO chama fallback
- [ ] **4.2.2 `[T]`** Testar fluxo PIX com fallback:
  - Mock `create-abacatepay-pix` retorna erro
  - Mock `create-asaas-pix` retorna sucesso
  - Verificar que fallback é chamado
  - Verificar que `PixPaymentDialog` abre com gateway='asaas'
- [ ] **4.2.3 `[T]`** Testar fluxo PIX com ambos falhando:
  - Ambos mocks retornam erro
  - Verificar que `rollbackOrder` é chamado
  - Verificar que toast de erro é exibido
- [ ] **4.2.4 `[I]`** Implementar lógica com try/catch e fallback

### 4.3 Atualizar `handleFinalizeOrder` — Cartão (sem rollback)

- [ ] **4.3.1 `[T]`** Testar cartão aprovado:
  - Mock `create-payment-asaas` retorna sucesso
  - Se `saveCard`: verificar INSERT em `saved_payment_methods`
  - Verificar redirecionamento para `/conta`
- [ ] **4.3.2 `[T]`** Testar cartão recusado (sem rollback):
  - Mock retorna erro
  - Verificar que NÃO chama `rollbackOrder`
  - Verificar redirecionamento para `/conta?payment=declined`
  - Verificar toast de erro
- [ ] **4.3.3 `[I]`** Implementar fluxo completo:
  - Obter token (novo ou salvo)
  - Chamar `create-payment-asaas`
  - Se sucesso + saveCard: salvar token
  - Se erro: navegar para `/conta` sem rollback

---

## Fase 5: Edge Functions de Suporte

### 5.1 `create-asaas-pix`

- [ ] **5.1.1 `[T]`** Testar criação de cobrança PIX no Asaas:
  - Mock `POST /v3/payments` com `billingType: "PIX"`
  - Verificar que salva `qr_code`, `qr_code_base64`, `pix_expiration`, `asaas_payment_id`
  - Verificar que retorna dados do QR Code
- [ ] **5.1.2 `[I]`** Implementar handler reusando `findOrCreateCustomer` do módulo compartilhado:
  ```ts
  import { findOrCreateCustomer } from '../_shared/asaasCustomer.ts';
  // → findOrCreateCustomer → POST /v3/payments PIX
  ```

### 5.2 `retry-payment-asaas`

- [ ] **5.2.1 `[T]`** Testar validação de tentativas:
  - `attempts >= 3` → erro "Número máximo de tentativas atingido"
  - `last_attempt_at < 10 min` + `attempts < 3` → OK
- [ ] **5.2.2 `[T]`** Testar retentativa bem-sucedida:
  - Cria novo payment, atualiza `asaas_payment_id`, incrementa `attempts`
- [ ] **5.2.3 `[T]`** Testar retentativa recusada:
  - Incrementa `attempts`, NÃO atualiza `asaas_payment_id`
- [ ] **5.2.4 `[I]`** Implementar reusando `findOrCreateCustomer` do módulo compartilhado

### 5.3 `refresh-pix`

- [ ] **5.3.1 `[T]`** Testar re-consulta de QR existente (sem custo):
  - Order tem `payment_gateway = 'asaas'` e `asaas_payment_id`
  - `GET /v3/payments/{asaasPaymentId}` retorna status `ACTIVE`
  - `GET /v3/payments/{id}/pixQrCode` retorna o QR Code
  - Verificar que NÃO criou novo payment (sem POST)
  - Verificar que retornou o mesmo QR Code
- [ ] **5.3.2 `[T]`** Testar criação de novo PIX (payment expirou):
  - `GET /v3/payments/{asaasPaymentId}` retorna status `OVERDUE`
  - Novo payment é criado (POST)
  - Dados da order são atualizados
- [ ] **5.3.3 `[I]`** Implementar:
  1. Verificar status do payment existente
  2. Se ativo: re-consultar QR (grátis)
  3. Se expirado: criar novo (AbacatePay → Asaas fallback)

### 5.4 `get-order-payment`

- [ ] **5.4.1 `[T]`** Testar retorno de dados:
  - Order com PIX: deve retornar `qrCode`, `pixExpiration`, `pixExpired`
  - Order com cartão recusado: deve retornar `paymentAttempts`, `attemptsRemaining`
  - Order com 24h+: deve retornar `status: "cancelado"`
  - Não deve expor dados sensíveis (token, customer_id)
- [ ] **5.4.2 `[I]`** Implementar

### 5.5 `verify-payment` — Suporte Asaas

- [ ] **5.5.1 `[T]`** Testar consulta de status Asaas:
  - `gateway='asaas'` com `asaas_payment_id` → `GET /v3/payments/{id}`
  - Mapeamento: `CONFIRMED → 'approved'`, `RECEIVED → 'approved'`, `PENDING → 'pending'`
- [ ] **5.5.2 `[I]`** Modificar `verify-payment` para aceitar `gateway`

---

## Fase 6: Modificar `PixPaymentDialog`

- [ ] **6.1 `[T]`** Testar polling com gateway='abacatepay' (comportamento atual)
- [ ] **6.2 `[T]`** Testar polling com gateway='asaas':
  - Mock `verify-payment` com `gateway='asaas'`
  - Verificar que chama edge function com parâmetro correto
- [ ] **6.3 `[T]`** Testar timeout de polling:
  - Após 15 min → parar polling
- [ ] **6.4 `[T]`** Testar "PIX expirado":
  - `pixExpiration` passou → exibir mensagem + botão "Gerar novo QR"
- [ ] **6.5 `[I]`** Implementar modificações:
  - Prop `gateway` no componente
  - Passar gateway para `verify-payment`
  - Timer de 15 min com `clearInterval`
  - Estado de expirado

---

## Fase 7: Modificar `Account.tsx` — Seção Pedidos Pendentes

### 7.1 Listagem de Pedidos Pendentes

- [ ] **7.1.1 `[T]`** Testar consulta de orders pendentes:
  - Mock `get-order-payment` para 3 pedidos (PIX válido, PIX expirado, cartão recusado)
  - Verificar que cada card é renderizado com ações corretas
- [ ] **7.1.2 `[T]`** Testar card PIX válido:
  - Exibe tempo restante
  - Botão "Ver QR Code PIX" → abre `PixPaymentDialog`
- [ ] **7.1.3 `[T]`** Testar card PIX expirado:
  - Exibe "🔴 PIX expirado"
  - Botão "Gerar novo PIX" → chama `refresh-pix`
- [ ] **7.1.4 `[T]`** Testar card cartão recusado:
  - Exibe "💳 Cartão recusado · X tentativa(s)"
  - Se attempts < 3: botões "Tentar novamente" + "Pagar com PIX"
  - Se attempts >= 3: apenas "Pagar com PIX"
- [ ] **7.1.5 `[I]`** Implementar seção na página Conta.tsx

### 7.2 Fluxo de Retentativa de Cartão em `/conta`

- [ ] **7.2.1 `[T]`** Testar abertura do CreditCardForm para retentativa:
  - Clicar "Tentar novamente" → exibir `CreditCardForm` em modal/inline
  - Preencher novo cartão → tokenizar → chamar `retry-payment-asaas`
- [ ] **7.2.2 `[T]`** Testar sucesso na retentativa → toast + recarregar lista
- [ ] **7.2.3 `[T]`** Testar falha na retentativa → incrementa tentativas + mensagem
- [ ] **7.2.4 `[I]`** Implementar fluxo de retentativa

---

## Fase 8: Edge Functions de Pós-Processamento

### 8.1 `asaas-webhook`

- [ ] **8.1.0 `[I]`** Implementar validação de autenticação:
  - Validar header `asaas-access-token` contra `ASAAS_WEBHOOK_AUTH_TOKEN` do `.env`
  - Rejeitar (401) se token ausente ou inválido
- [ ] **8.1.1 `[T]`** Testar `PAYMENT_CONFIRMED`:
  - Receber webhook com `event: "PAYMENT_CONFIRMED"` e `payment.id`
  - Verificar que order é atualizada para `em_preparo`
  - Verificar que ações pós-pagamento são executadas
  - Verificar idempotência: se já `em_preparo`, ignorar (HTTP 200)
- [ ] **8.1.2 `[T]`** Testar `PAYMENT_REFUNDED`:
  - Order atualizada para `cancelado`
  - `payment_refunds` recebe registro
- [ ] **8.1.3 `[T]`** Testar `PAYMENT_OVERDUE`:
  - Apenas log, sem alteração de status
- [ ] **8.1.4 `[T]`** Testar idempotência:
  - Mesmo evento enviado 2x → apenas o primeiro processa, segundo retorna 200
- [ ] **8.1.5 `[I]`** Implementar webhook handler:
  - Extrair `asaas-access-token` do header → validar
  - Extrair `event` e `payment` do body
  - Switch/case para eventos relevantes
  - Delegar pós-pagamento para `_shared/` ou chamar `payment-webhook` internamente
  - Retornar HTTP 200 em até 10s

### 8.2 `cancel-expired-orders` (Cron Job — já existente)

> ❌ NÃO criar `auto-cancel-orders` — a função `cancel-expired-orders` já existe e implementa a mesma lógica.

- [ ] **8.2.1 `[T]`** Testar que pedidos Asaas `aguardando_pagamento` > 24h são cancelados:
  - Verificar que a query existente cobre pedidos com `payment_gateway = 'asaas'`
  - Se necessário, adicionar condição para tratar cartão recusado com 3 tentativas
- [ ] **8.2.2 `[T]`** Testar que pedidos recentes NÃO são cancelados
- [ ] **8.2.3 `[I]`** Estender (se necessário) a função existente em `supabase/functions/cancel-expired-orders/index.ts`:
  - Adicionar validação para `payment_gateway = 'asaas'`
  - Adicionar tratamento de cartão recusado com 3 tentativas
- [ ] **8.2.4 `[V]`** Verificar cron job configurado (já operacional)

---

## Fase 9: Testes Integrados e End-to-End

### 9.1 Testes de Integração

- [ ] **9.1.1** Testar fluxo completo PIX AbacatePay → sucesso (sandbox real)
- [ ] **9.1.2** Testar fluxo completo PIX AbacatePay → fallback Asaas (simular falha)
- [ ] **9.1.3** Testar fluxo completo cartão de crédito → aprovado
- [ ] **9.1.4** Testar fluxo completo cartão de crédito → recusado → retentativa em `/conta`
- [ ] **9.1.5** Testar fluxo completo cartão salvo → compra subsequente
- [ ] **9.1.6** Testar parcelamento 10x sem juros
- [ ] **9.1.7** Testar expiração de PIX → refresh-pix
- [ ] **9.1.8** Testar webhook Asaas → confirmação + estoque

### 9.2 Testes de Regressão

- [ ] **9.2.1** Verificar que PIX AbacatePay existente continua funcionando
- [ ] **9.2.2** Verificar que `abacatepay-webhook` existente continua funcionando (assinatura HMAC válida pós-BUG-001)
- [ ] **9.2.3** Verificar que remoção do Mercado Pago não quebrou outras partes
- [ ] **9.2.4** Verificar que `verify-payment` funciona para AbacatePay (pós-BUG-002)
- [ ] **9.2.5** Verificar que `platformFee` e `receiptUrl` estão sendo persistidos (pós-BUG-004, BUG-006)
- [ ] **9.2.6** Verificar que webhooks duplicados não processam 2x (pós-BUG-007)

---

## Fase 10: Produção

- [ ] **10.1** Solicitar ativação de tokenização ao suporte Asaas para produção
- [ ] **10.2** Atualizar variáveis de ambiente em produção:
  ```env
  ASAAS_API_KEY=<chave_producao>
  ASAAS_ENVIRONMENT=production
  ```
  ```env
  VITE_ASAAS_PUBLIC_KEY=<chave_publica_producao>
  VITE_ASAAS_ENVIRONMENT=production
  ```
- [ ] **10.3** Configurar webhook real no Asaas produção:
  - URL: `https://<projeto>.supabase.co/functions/v1/asaas-webhook`
  - Eventos: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_REFUNDED`
- [ ] **10.4** Configurar cron job `auto-cancel-orders` em produção
- [ ] **10.5** Desativar opção "Cartão de Crédito" do AbacatePay (checkout hospedado)
- [ ] **10.6** Testar smoke test em produção com cartão de teste real (se possível)

---

## Resumo de Entregas

| Fase | Artefatos | Testes |
|:----:|-----------|:------:|
| 0 | Config, remoteIp | 1 |
| 0.5 | **Bug fixes AbacatePay** (7 bugs) | **14** |
| 1 | Migration SQL | 1 manual |
| 1.5 | `_shared/asaasCustomer.ts` | 3 |
| 2 | `create-payment-asaas` | 12 |
| 3 | `CreditCardForm.tsx` | 15 |
| 4 | `CheckoutEntrega.tsx` | 9 |
| 5 | 4 edge functions | 10 |
| 6 | `PixPaymentDialog` | 4 |
| 7 | `Account.tsx` | 8 |
| 8 | Webhook + cron | 6 |
| 9 | Testes E2E | 11 |
| 10 | Produção | — |
| **Total** | **17 fases** | **~94 testes** |
