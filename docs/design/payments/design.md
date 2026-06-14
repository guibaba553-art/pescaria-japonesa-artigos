# Design: Integração de Pagamentos — AbacatePay + Asaas

> **Visão:** Técnica
> **Público:** Desenvolvedores, arquitetos, revisores de código
> **Versão:** 1.0

---

## Abordagem Técnica

Substituir o checkout hospedado do AbacatePay para cartão de crédito por um checkout transparente Asaas com tokenização no frontend. O PIX continua via AbacatePay como primário, com fallback automático para Asaas quando o AbacatePay estiver indisponível. Pedidos com cartão recusado não sofrem rollback — permanecem em `aguardando_pagamento` para retentativa via `/conta`.

### Diagrama de Contexto

```
┌──────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   Usuário    │─────►│  CheckoutEntrega │─────►│  AbacatePay API  │
│   (Browser)  │      │  (React SPA)     │      │  (PIX primário)  │
│              │      │                  │      └──────────────────┘
│  HTTPS POST  │      │  ┌────────────┐  │      ┌──────────────────┐
│  (dados do   │─────►│  │CreditCard  │──┼─────►│  Asaas API       │
│   cartão)    │      │  │Form        │  │      │  (cartão + PIX   │
│              │      │  └────────────┘  │      │   fallback)      │
└──────────────┘      │                  │      └──────────────────┘
                      │  ┌────────────┐  │
                      │  │PixPayment  │  │      ┌──────────────────┐
                      │  │Dialog      │  │      │  Supabase        │
                      │  └────────────┘  │◄────►│  (DB + Edge Fn)  │
                      └──────────────────┘      └──────────────────┘
```

---

## Stack e Dependências

| Componente | Tecnologia | Versão |
|-----------|-----------|--------|
| Frontend | React + TypeScript | 18 / 5 |
| API Asaas | REST (`/api/v3/`) — server-side | — |
| API AbacatePay | REST (`/v2/`) | — |
| Edge Functions | Deno (Supabase) | 2.x |
| Banco | PostgreSQL (Supabase) | 15 |
| Testes | Vitest + Testing Library | 3.x |

> ⚠️ **Não existe SDK JS client-side do Asaas.** Tokenização é server-side via `POST /v3/creditCard/tokenizeCreditCard`.
>
> ⚠️ **Headers obrigatórios:** `access_token` (API Key) + `User-Agent: JapasPesca/1.0.0` em toda chamada ao Asaas.

---

## Decisões de Arquitetura

### AD-001: Tokenização do cartão via API Asaas no backend (server-side)

**Contexto:** Precisamos capturar dados de cartão de forma segura sem redirecionar o usuário.

**Decisão:** O Asaas **não oferece SDK client-side** (não existe `AsaasCreditCard` JS). A tokenização é exclusivamente server-side: a edge function recebe os dados brutos do cartão (`creditCard` + `creditCardHolderInfo`) do frontend via HTTPS e os envia para `POST /v3/payments` Asaas. Após pagamento aprovado, um token reutilizável é obtido via `POST /v3/creditCard/tokenizeCreditCard` ou extraído da resposta do pagamento.

**Consequências:**
- ✅ PCI-compliant via SAQ-D: dados do cartão trafegam no backend (HTTPS obrigatório)
- ✅ Token único por transação; token reutilizável apenas após aprovação
- ⚠️ Sem SDK client-side — responsabilidade de segurança recai sobre o backend do app (certificação SAQ-D)
- ⚠️ Certificação PCI SAQ-D é exigida (mais rigorosa que SAQ-A, que seria suficiente com SDK client-side)

### AD-002: Dois fluxos de criação de cartão (novo vs salvo)

**Contexto:** Usuários podem ter cartões salvos e também cadastrar novos cartões.

**Decisão:** O `CreditCardForm` opera em dois modos:
- `'saved'`: usuário seleciona cartão existente → usa token reutilizável armazenado → sem SDK
- `'new'`: usuário preenche dados → SDK tokeniza → token single-use → se aprovado e opt-in, salva token reutilizável

**Consequências:**
- ✅ Mínimo de atrito para usuários recorrentes
- ✅ Salvamento explícito e post-hoc (apenas após aprovação)
- ⚠️ Precisa gerenciar lista local em `saved_payment_methods` (Asaas não expõe API de listagem)

### AD-003: Fallback PIX automático e invisível

**Contexto:** Queremos alta disponibilidade de PIX sem sobrecarregar o usuário com escolhas.

**Decisão:** O `handleFinalizeOrder` tenta AbacatePay primeiro. Se falhar (erro de rede, timeout, gateway offline), chama `create-asaas-pix` automaticamente. O usuário vê apenas o QR Code final, sem saber qual gateway processou.

**Consequências:**
- ✅ Resiliência: se AbacatePay cair, PIX continua funcionando
- ✅ Transparente para o usuário
- ⚠️ Duas chamadas de API quando AbacatePay falha — latência maior
- ⚠️ Precisa de timeout curto no AbacatePay para não atrasar o fallback

### AD-004: Sem rollback em cartão recusado

**Contexto:** Anteriormente, cartão recusado deletava o pedido e liberava estoque. Agora queremos que o usuário possa retentar.

**Decisão:** Quando o cartão é recusado, a edge function `create-payment-asaas` apenas incrementa `payment_attempts` e `last_payment_attempt_at` na order. O pedido permanece `aguardando_pagamento`. O frontend redireciona para `/conta` com as opções de retentativa.

**Consequências:**
- ✅ Usuário pode tentar outro cartão sem recriar o pedido
- ✅ Estoque continua reservado por 30 min (TTL da reserva)
- ✅ **Sem custo extra** — transações recusadas não são persistidas no Asaas, logo não geram taxa
- ⚠️ Risco de estoque ocupado por pedidos não pagos — mitigado pelo auto-cancelamento em 24h e TTL da reserva

### AD-005: Seis edge functions para fluxo de pagamento + reaproveitamento de existentes

**Contexto:** Precisamos separar responsabilidades no backend.

**Decisão:** Dividir em funções especializadas e reaproveitar as que já existem:

| Função | Responsabilidade | Gateway | Status |
|--------|-----------------|---------|--------|
| `create-payment-asaas` | Processa cartão (novo ou salvo) com 11 campos obrigatórios | Asaas | NOVA |
| `retry-payment-asaas` | Retentativa de cartão em pedido existente | Asaas | NOVA |
| `create-asaas-pix` | Cria cobrança PIX (fallback) | Asaas | NOVA |
| `refresh-pix` | Re-consulta QR Code PIX existente ou cria novo se expirado | Asaas | NOVA |
| `get-order-payment` | Retorna dados de pagamento para `/conta` | — | NOVA |
| `asaas-webhook` | Recebe notificações Asaas, valida `asaas-access-token`, deduplica eventos | Asaas | NOVA |
| `create-abacatepay-pix` | Cria cobrança PIX | AbacatePay | EXISTENTE |
| `verify-payment` | Consulta status do pagamento | Ambos | MODIFICAR |
| `abacatepay-webhook` | Recebe notificações AbacatePay (HMAC) | AbacatePay | EXISTENTE |
| `cancel-expired-orders` | Cron job: cancela pedidos >24h + libera estoque + notifica | — | EXISTENTE |
| `payment-webhook` | Pós-processamento: estoque, NF-e, etiqueta, e-mail | Mercado Pago | EXISTENTE |

**Consequências:**
- ✅ Cada função tem uma responsabilidade clara
- ✅ Facilita testes e deploy independente
- ✅ **Mitigado:** a lógica de criação de customer Asaas é extraída para `supabase/functions/_shared/asaasCustomer.ts` e reutilizada por todas as funções que precisam (`create-payment-asaas`, `create-asaas-pix`, `retry-payment-asaas`)
- ✅ **Reaproveitamento:** `cancel-expired-orders` já faz o auto-cancelamento de 24h com liberação de estoque, restauração de stock, e-mail — não precisa de `auto-cancel-orders` novo
- ✅ **Reaproveitamento:** `payment-webhook` já tem lógica de pós-pagamento (NF-e, etiqueta, e-mail) — `asaas-webhook` pode delegar para funções compartilhadas ou chamar `payment-webhook` internamente
- ⚠️ As funções de webhook (`asaas-webhook`) não usam a lógica compartilhada — operam com `asaas_payment_id` já salvo na order, então não precisam criar customer

---

### Módulo Compartilhado: `_shared/asaasCustomer.ts`

**Propósito:** Evitar duplicação da lógica de buscar/criar Customer Asaas entre as edge functions que processam pagamento.

**Localização:** `supabase/functions/_shared/asaasCustomer.ts`

**Interface:**
```ts
interface CustomerData {
  name: string;
  email: string;
  cpfCnpj: string;
  phone: string;
}

interface AsaasCustomerResult {
  id: string; // cus_xxx
  created: boolean; // true se foi criado agora, false se já existia
}

/**
 * Busca o Customer Asaas pelo CPF ou cria um novo.
 * - Se profiles.asaas_customer_id já existe, revalida com GET /v3/customers/{id}
 * - Se não existe, cria via POST /v3/customers e salva o ID em profiles
 */
export async function findOrCreateCustomer(
  supabase: SupabaseClient,
  userId: string,
  customerData: CustomerData
): Promise<AsaasCustomerResult>;
```

**Uso nas edge functions:**
```ts
// create-payment-asaas/index.ts
import { findOrCreateCustomer } from '../_shared/asaasCustomer.ts';

const customer = await findOrCreateCustomer(supabase, user.id, customerData);
// → POST /v3/payments com customer.id
```

```ts
// create-asaas-pix/index.ts
import { findOrCreateCustomer } from '../_shared/asaasCustomer.ts';

const customer = await findOrCreateCustomer(supabase, user.id, customerData);
// → POST /v3/payments PIX com customer.id
```

```ts
// retry-payment-asaas/index.ts
import { findOrCreateCustomer } from '../_shared/asaasCustomer.ts';

const customer = await findOrCreateCustomer(supabase, user.id, customerData);
// → POST /v3/payments com customer.id
```

---

## Fluxo de Dados

### Cartão de Crédito — Primeira Compra

```
CheckoutEntrega                          Edge Function                     Asaas API
    │                                        │                              │
    │  1. Preenche formulário               │                              │
    │  2. Asaas SDK tokenize()              │                              │
    │     └─ creditCardToken ──────────────►│                              │
    │                                       │  3. Busca/cria Customer      │
    │                                       │     ─────────────────────────►│
    │                                       │  ◄─── cus_xxx ──────────────│
    │                                       │                              │
    │                                       │  4. POST /v3/payments        │
    │                                       │     { creditCardToken }      │
    │                                       │     ─────────────────────────►│
    │  ◄── { success, cardInfo? } ─────────│  ◄─── payment ──────────────│
    │                                       │                              │
    │  5. Se aprovado + saveCard:           │                              │
    │     INSERT saved_payment_methods      │                              │
    │  6. Navigate /conta                   │                              │
```

### PIX com Fallback

```
CheckoutEntrega              create-abacatepay-pix        create-asaas-pix
    │                              │                          │
    │  1. Tenta AbacatePay ──────►│                          │
    │  ◄── Erro ─────────────────│                          │
    │                              │                          │
    │  2. Fallback Asaas ──────────────────────────────────►│
    │  ◄── QR Code ────────────────────────────────────────│
    │                                                        │
    │  3. Exibe PixPaymentDialog                             │
```

### `/conta` — Retentativa de Cartão

```
Conta.tsx                        retry-payment-asaas           Asaas API
    │                                   │                        │
    │  1. Abre CreditCardForm           │                        │
    │  2. Usuário preenche novo cartão  │                        │
    │  3. SDK tokeniza                  │                        │
    │     └─ creditCardToken ──────────►│                        │
    │                                   │  4. Verifica attempts  │
    │                                   │  5. POST /v3/payments  │
    │                                   │     ──────────────────►│
    │  ◄── { success } ────────────────│  ◄── payment ─────────│
```

---

## Modelo de Dados

### Migração SQL

```sql
-- profiles: vincula usuário ao Customer Asaas
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS asaas_customer_id text;

-- orders: dados de pagamento
ALTER TABLE orders ADD COLUMN IF NOT EXISTS asaas_payment_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_gateway text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_attempts integer DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_payment_attempt_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_due_at timestamptz;

-- saved_payment_methods: token reutilizável Asaas
ALTER TABLE saved_payment_methods ADD COLUMN IF NOT EXISTS asaas_credit_card_token text;

-- índice para consulta de pedidos pendentes
CREATE INDEX IF NOT EXISTS idx_orders_pending_payment
  ON orders (status, created_at)
  WHERE status = 'aguardando_pagamento';
```

### Estados do Pedido

```
                  ┌─────────────────┐
                  │  aguardando      │
                  │  pagamento       │
                  └────────┬────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
         Pago via    24h sem     3 tentativas
         webhook    pagamento    cartão
              │            │            │
              ▼            ▼            ▼
         ┌──────────┐  ┌──────────┐  ┌──────────┐
         │em_preparo│  │cancelado │  │cancelado │
         └──────────┘  └──────────┘  └──────────┘
```

---

## API — Contratos das Edge Functions

### POST `create-payment-asaas`

**Request (cartão novo — 1ª compra):**
```json
{
  "orderId": "uuid",
  "installmentCount": 3,
  "saveCard": false,
  "creditCard": {
    "holderName": "JOÃO SILVA",
    "number": "4000000000000010",
    "expiryMonth": "12",
    "expiryYear": "2030",
    "ccv": "123"
  },
  "creditCardHolderInfo": {
    "name": "João Silva",
    "email": "joao@email.com",
    "cpfCnpj": "12345678901",
    "postalCode": "78556100",
    "addressNumber": "123",
    "addressComplement": "Apto",
    "phone": "6634211234",
    "mobilePhone": "66999999999"
  },
  "remoteIp": "187.22.45.123",
  "customerData": {
    "name": "João Silva",
    "email": "joao@email.com",
    "cpfCnpj": "12345678901",
    "phone": "66999999999"
  }
}
```

**Request (cartão salvo):**
```json
{
  "orderId": "uuid",
  "creditCardToken": "a75a1d98-c52d-4a6b-a413-71e00b193c99",
  "installmentCount": 1,
  "saveCard": false,
  "remoteIp": "187.22.45.123",
  "customerData": { ... }
}
```

**Response 200 (aprovado):**
```json
{
  "success": true,
  "payment": { "id": "pay_...", "status": "CONFIRMED", "installments": 3, "value": 150.00, "netValue": 142.50 },
  "cardInfo": {
    "brand": "VISA", "last4": "0010",
    "creditCardToken": "76496073-...", "cardExpiryMonth": "12", "cardExpiryYear": "2030"
  }
}
```

**Response 400 (recusado):**
```json
{ "success": false, "error": "Cartão recusado. Verifique os dados e tente novamente.", "attemptsRemaining": 2 }
```

> ⚠️ **Atenção:** Os campos `creditCard`, `creditCardHolderInfo` e `remoteIp` são todos obrigatórios para 1ª compra. A edge function deve adicionar `User-Agent: JapasPesca/1.0.0` e `access_token`. Timeout mínimo: 60 segundos.

### POST `retry-payment-asaas`

**Request:** Mesmo schema de `create-payment-asaas`, mas recebe `orderId` já existente.

**Validações:**
- Order deve estar `aguardando_pagamento`
- `payment_attempts < 3`
- `last_payment_attempt_at` dentro da janela de 10 min (ou sem tentativa anterior)

### POST `create-asaas-pix`

**Request:** `{ "orderId": "uuid" }`

**Response:**
```json
{ "success": true, "data": { "id": "pay_...", "brCode": "000201...", "brCodeBase64": "iVBOR...", "expiresAt": "2025-01-01T23:59:59Z" } }
```

### POST `refresh-pix`

**Request:** `{ "orderId": "uuid" }`

**Processo (sem custo na maioria dos casos):**
1. Verifica se o payment Asaas ainda está ativo (`GET /v3/payments/{asaasPaymentId}`)
2. Se ativo e PIX: apenas re-consulta `GET /v3/payments/{id}/pixQrCode` e retorna o mesmo QR (sem custo)
3. Se expirado/cancelado: cria novo payment (AbacatePay → Asaas fallback) e atualiza order

### POST `get-order-payment`

**Request:** `{ "orderId": "uuid" }`

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "aguardando_pagamento",
    "totalAmount": 150.00,
    "paymentMethod": "pix",
    "paymentGateway": "abacatepay",
    "qrCode": "000201...",
    "qrCodeBase64": "iVBOR...",
    "pixExpiration": "2025-01-01T23:59:59Z",
    "pixExpired": false,
    "paymentAttempts": 0,
    "attemptsRemaining": 3,
    "lastAttemptAt": null,
    "cardBrand": null,
    "cardLastDigits": null
  }
}
```

---

## Configuração

### Variáveis de Ambiente

```env
# supabase/functions/.env
ASAAS_API_KEY=
ASAAS_ENVIRONMENT=sandbox
ABACATEPAY_API_KEY=  # já existe
```

### Constantes do App

```ts
// src/config/constants.ts
export const ASAAS_CONFIG = {
  API_KEY: '', // NUNCA expor no frontend — apenas na edge function
  ENVIRONMENT: import.meta.env.VITE_ASAAS_ENVIRONMENT ?? 'sandbox',
  BASE_URL: import.meta.env.VITE_ASAAS_ENVIRONMENT === 'production'
    ? 'https://api.asaas.com'
    : 'https://api-sandbox.asaas.com',
} as const;

export const PAYMENT_CONFIG = {
  PIX_EXPIRATION_MINUTES: 30,
  STOCK_RESERVE_TTL_MINUTES: 30,
  CARD_RETRY_MAX_ATTEMPTS: 3,
  CARD_RETRY_WINDOW_MINUTES: 10,
  PENDING_ORDER_CANCEL_HOURS: 24,
  POLLING_INTERVAL_MS: 5000,
  POLLING_MAX_MINUTES: 15,
  ASAAS_TIMEOUT_MS: 60000, // Mínimo 60s para cartão (recomendação oficial)
} as const;

// Headers obrigatórios em toda chamada ao Asaas
export const ASAAS_HEADERS = {
  'User-Agent': 'JapasPesca/1.0.0',
  'Content-Type': 'application/json',
} as const;
```

---

## Estrutura de Arquivos

```
src/
├── components/
│   ├── CreditCardForm.tsx          ← NOVO
│   └── PixPaymentDialog.tsx        ← MODIFICAR
├── config/
│   └── constants.ts                ← MODIFICAR
├── pages/
│   ├── CheckoutEntrega.tsx         ← MODIFICAR
│   └── Account.tsx                 ← MODIFICAR
└── integrations/
    └── supabase/
        └── client.ts               ← (inalterado)

supabase/
├── migrations/
│   └── YYYYMMDDHHMMSS_add_asaas_fields.sql  ← NOVO
└── functions/
    ├── _shared/
    │   └── asaasCustomer.ts         ← NOVO (lógica compartilhada)
    ├── create-payment-asaas/       ← NOVO
    ├── create-asaas-pix/           ← NOVO
    ├── retry-payment-asaas/        ← NOVO
    ├── refresh-pix/                ← NOVO
    ├── get-order-payment/          ← NOVO
    ├── asaas-webhook/              ← NOVO
    ├── verify-payment/             ← MODIFICAR
    ├── cancel-expired-orders/      ← (existente — já faz auto-cancelamento)
    ├── create-abacatepay-pix/      ← (inalterado)
    └── abacatepay-webhook/         ← (inalterado)
```

---

## Riscos Técnicos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|:-----------:|:-------:|-----------|
| SDK Asaas não carregar (CDN down) | Baixa | Alto | Load dinâmico com retry; fallback com mensagem de erro |
| Tokenização não ativada em produção | Média | Alto | Solicitar ativação ao suporte Asaas antes do deploy |
| Timeout na criação de customer Asaas | Baixa | Médio | Timeout de 60s nas edge functions |
| AbacatePay fora do ar | Baixa | Alto | Fallback automático para Asaas PIX |
| Concorrência webhook + polling | Média | Baixo | Atualização idempotente com guard de status (`status != 'em_preparo'`) |
| Token Asaas expirar | Baixa | Médio | Tratar erro 400 e solicitar novo cadastro de cartão |
| **Custo inesperado com refresh de PIX** | **Muito Baixa** | **Baixo** | Asaas só cobra por transações concluídas; re-consultar QR é grátis. Refresh raramente precisa criar novo payment. |
| **Custo com retentativa de cartão** | **Média** | **Nulo** | Transações recusadas não são persistidas no Asaas — sem cobrança. |
