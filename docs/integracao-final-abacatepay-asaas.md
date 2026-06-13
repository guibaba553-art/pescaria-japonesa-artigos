# Plano de Integração: AbacatePay + Asaas

## Objetivo

Unificar **AbacatePay** (PIX principal) e **Asaas** (cartão de crédito + PIX fallback) em um único fluxo de checkout transparente, permitindo que o cliente salve cartões tokenizados no Asaas para reutilização em compras futuras, com salvamento explícito e apenas após pagamento aprovado.

## Decisões

| Decisão | Escolha |
|---------|---------|
| PIX principal | AbacatePay (transparente) |
| Fallback PIX | Asaas (automático, transparente p/ usuário) |
| Cartão de crédito | Asaas checkout transparente (formulário inline) |
| Cartões salvos | Sim — tokenizados e armazenados localmente + Asaas |
| Salvamento de cartão | **Opt-in explícito** (checkbox "Salvar para compras futuras") |
| Momento do salvamento | **Após pagamento aprovado** — nunca antes |
| Múltiplos cartões | Sim — gerenciados via `saved_payment_methods` |
| Mercado Pago / carteiras | Removido |
| AbacatePay para cartão | Desativado (checkout hospedado) |
| **Pedido recusado** | **Não faz rollback** — mantém order `aguardando_pagamento` p/ retentar |
| **Pagamento fora do checkout** | Pagamento pode ser concluído de `/conta` (pedidos pendentes) |

---

## Sumário da API Asaas (pesquisado)

| Endpoint | Propósito | Uso no plano |
|----------|-----------|-------------|
| `POST /v3/customers` | Criar cliente Asaas | Criar/obter customer por CPF |
| `POST /v3/creditCard/tokenizeCreditCard` | Tokenizar cartão **sem cobrança** (server-side) | 🔑 Tokenização pós-pagamento aprovado para salvar cartão |
| `POST /v3/payments` (com `creditCardToken`) | Criar e processar cobrança com token | Pagamento com cartão salvo (token reutilizável) |
| `POST /v3/payments` (com objeto `creditCard` + `creditCardHolderInfo` + `remoteIp`) | Criar e processar cobrança com dados brutos | 1ª compra — envia os 10 campos obrigatórios do cartão/titular |
| `GET /v3/payments/{id}` | Consultar status | Polling + webhook |
| `GET /v3/payments/{id}/pixQrCode` | Obter QR Code PIX (base64 + payload + expiração) | Exibição do QR — **body da request DEVE ser vazio** (403 se enviar body) |
| `GET /v3/payments?externalReference=` | Buscar cobrança por referência externa | Idempotência — reexibir PIX já criado |
| `POST /v3/payments` (com `billingType: PIX`) | Criar cobrança PIX | Fallback PIX quando AbacatePay falha |
| **Webhooks** | Eventos de pagamento | 11 eventos relevantes (ver REQ-008 no spec) |

> ⚠️ **Headers obrigatórios em toda chamada:** `access_token` (API Key) + `User-Agent` (ex: `JapasPesca/1.0.0`) + `Content-Type: application/json`.

> ⚠️ **Timeout:** Mínimo 60 segundos para chamadas de cartão (recomendação oficial — evita duplicatas).

> ⚠️ **API Key:** Produção `$aact_prod_...`, Sandbox `$aact_hmlg_...`. Até 10 chaves por conta. Expira após 6 meses de inatividade.

**Campos obrigatórios para cartão (todos requeridos pelo Asaas):**

```
creditCard.holderName     ✅ Nome no cartão
creditCard.number         ✅ Número completo
creditCard.expiryMonth    ✅ 2 dígitos (ex: "06")
creditCard.expiryYear     ✅ 4 dígitos (ex: "2026")
creditCard.ccv            ✅ Código segurança
creditCardHolderInfo.name           ✅ Nome do titular
creditCardHolderInfo.email          ✅ Email
creditCardHolderInfo.cpfCnpj        ✅ CPF/CNPJ
creditCardHolderInfo.postalCode     ✅ CEP (ex: "89223005")
creditCardHolderInfo.addressNumber  ✅ Número do endereço
creditCardHolderInfo.phone          ✅ Telefone fixo com DDD
creditCardHolderInfo.mobilePhone    Opcional
remoteIp                  ✅ IP real do comprador
```

**Descobertas importantes:**
- `POST /v3/creditCard/tokenizeCreditCard` é o endpoint server-side para tokenizar cartão **sem criar cobrança**, retornando `creditCardToken`, `creditCardNumber` (últ. 4 dígitos) e `creditCardBrand`
- O token gerado é **reutilizável** e fica vinculado ao **customer** (não serve para outro cliente)
- Após um pagamento bem-sucedido via `POST /v3/payments`, a resposta também inclui `creditCardToken` no body — pode ser usado para salvamento sem chamar tokenize separado
- **Não há** endpoint público para listar/deletar cartões salvos do customer — gerenciamos a lista localmente via `saved_payment_methods`
- Tokenização precisa ser **ativada pelo suporte Asaas** em produção (sandbox já vem ativo)
- `externalReference` no POST `/v3/payments` permite buscar cobranças por `GET /v3/payments?externalReference=order-uuid`
- Cartão recusado **não é persistido** pelo Asaas (HTTP 400) — sem custo e sem `payment_id`
- Para 1ª compra, NÃO usar `installmentCount`/`installmentValue` se for pagamento à vista (1x) — apenas `value`
- `dueDate` é obrigatório mesmo para cartão (captura imediata), mas não afeta o momento da cobrança
- Status `CONFIRMED` em PIX de pessoa física pode ser temporário (bloqueio cautelar de até 72h) — líquido só em `RECEIVED`
- `PAYMENT_RECEIVED` para cartão ocorre ~30 dias após `PAYMENT_CONFIRMED`

---

## Limites de Tempo

| Parâmetro | Valor | Onde é definido | Comportamento ao expirar |
|-----------|-------|----------------|--------------------------|
| **Reserva de estoque** | **30 min** | RPC `reserve_stock_for_order` (já existe) | Libera estoque automaticamente |
| **Validade QR Code PIX** | **30 min** (AbacatePay) / **15-30 min** (Asaas) | Gateway | Cobrança vira `OVERDUE` no gateway |
| **Tempo p/ pagar o PIX** | **30 min** (até expirar a reserva) | App — `orders.pix_expiration` | Se PIX expirar → usuário pode gerar novo QR |
| **Auto-cancelamento do pedido** | **30 min** (atrelado à reserva) | RPC + cron job | `order.status = 'cancelado'` se `aguardando_pagamento` + reserva expirada |
| **Janela de retentativa de cartão** | **10 min** após recusa | App — `orders.payment_attempts` | Após 10 min ou 3 tentativas: pedido permanece, mas exige novo QR PIX |
| **TTL do pedido não pago** | **24 h** | Cron job / edge function | Cancela pedidos `aguardando_pagamento` sem pagamento após 24h |
| **Polling verify-payment** | A cada **5 s** até **15 min** | `PixPaymentDialog` | Para de poluir após 15 min (estouro) |

### Matriz de estados e ações

```
Status do pedido: aguardando_pagamento
  ├── PIX gerado (qr_code preenchido):
  │     └── pix_expiration ainda válido?
  │           ├── Sim → exibir QR Code, permitir pagamento
  │           └── Não → "PIX expirado", botão "Gerar novo QR"
  │
  ├── Cartão recusado (payment_attempts > 0):
  │     └── Tentativas < 3 e tempo desde último < 10 min?
  │           ├── Sim → exibir "Tentar novamente com cartão" ou "Pagar com PIX"
  │           └── Não → exibir apenas "Pagar com PIX"
  │
  └── Nenhuma tentativa:
        └── Exibir escolha de método + formulário
```

### Fluxo de auto-cancelamento

```
Cron job (supabase scheduled function) — executa a cada 5 min:

1. Busca orders com status = 'aguardando_pagamento'
2. Para cada uma:
   ├── Reserva de estoque expirou (stock_reservations com TTL vencido)?
   │     └── Sim: não cancela ainda — stock já foi liberado
   │
   ├── Pagamento via PIX:
   │     └── pix_expiration expirou e não há payment_id do Asaas/AbacatePay?
   │           └── Cancela: status = 'cancelado', notifica usuário
   │
   ├── Pagamento via cartão:
   │     └── payment_attempts >= 3 e todas recusadas?
   │           └── Cancela: status = 'cancelado'
   │
   └── 24h desde created_at sem confirmação?
         └── Cancela: status = 'cancelado'
```

---

## Fluxos

### Fluxo PIX (AbacatePay → fallback Asaas) — com persistência

```
Usuário seleciona "PIX"
  → Clica "Finalizar pedido"
  → Pedido criado no banco (stock reservado 30 min)
  → Tenta create-abacatepay-pix
    ├─ Sucesso → Salva qr_code, pix_expiration, payment_gateway='abacatepay'
    │           → Abre PixPaymentDialog (QR Code AbacatePay)
    │           → Polling verify-payment a cada 5s
    │           → Usuário pode FECHAR o dialog e sair da página
    │           → QR Code fica acessível em /conta > pedido > "Ver PIX"
    │
    └─ Falha   → Chama create-asaas-pix (fallback automático)
                  ├─ Sucesso → Salva qr_code, pix_expiration, payment_gateway='asaas'
                  │           → Abre PixPaymentDialog (QR Code Asaas)
                  │           → Mesmo fluxo de persistência
                  └─ Rollback se ambos falharem
```

### Fluxo PIX — retorno em `/conta`

```
Usuário volta em http://localhost:8080/conta
  → Vê pedido com status "Aguardando pagamento"
  → Clica "Ver PIX"
  → Verifica:
      ├─ pix_expiration ainda válido?
      │     → Exibe QR Code novamente + polling
      └─ pix_expiration expirou?
            → Botão "Gerar novo QR Code"
            → Chama edge function refresh-pix (renova QR)
```

### Fluxo Cartão de Crédito (primeira compra) — sem rollback

```
Usuário seleciona "Cartão de Crédito"
  → Vê lista de cartões salvos (vazia na 1ª vez)
  → Clica "Usar novo cartão" → formulário expande
  → Preenche dados do cartão
  → ☐ Salvar cartão para compras futuras (opcional, desligado)
  → Seleciona parcelamento (até 10x sem juros)
  → Clica "Finalizar pedido"
  → Pedido criado no banco (stock reservado 30 min)
  → Frontend envia dados brutos do cartão para edge function
  → Edge function chama POST /v3/payments (Asaas) com:
      { creditCard, creditCardHolderInfo, remoteIp, customer }
  ├── Aprovado (HTTP 200, status CONFIRMED):
  │     → Atualiza order para em_preparo
  │     → Se saveCard=true: chama POST /v3/creditCard/tokenizeCreditCard
  │       e salva token reutilizável em saved_payment_methods
  │     → Redireciona para /conta com toast de sucesso
  └── Recusado:
        → NÃO deleta o pedido
        → Atualiza payment_attempts += 1
        → Mostra erro: "Cartão recusado. Deseja tentar novamente ou pagar com PIX?"
        → Redireciona para /conta com opções de retentativa
```

### Fluxo Cartão — retentativa em `/conta`

```
Usuário está em /conta com pedido recusado
  → Vê pedido: "Aguardando pagamento — cartão recusado"
  → Opções:
      ├─ "Tentar outro cartão" → abre CreditCardForm inline (mesmo fluxo)
      │     → Chama retry-payment-asaas (novo payment no Asaas)
      │     ├─ Aprovado → /conta sucesso
      │     └─ Recusado → incrementa attempts + mensagem
      │
      └─ "Pagar com PIX" → redireciona para /checkout/entrega?orderId=X
            → Ou: gera PIX na hora e exibe dialog
```

---

## Arquitetura

```
┌──────────────────────────────────────────────────────────────────┐
│                      Frontend (React)                             │
│                                                                   │
│  ┌──────────────────────────────────────────────────────┐        │
│  │  CheckoutEntrega.tsx                                   │        │
│  │                                                        │        │
│  │  selectedPayment === 'pix'                             │        │
│  │    → handleFinalizeOrder()                             │        │
│  │      → create-abacatepay-pix (try)                     │        │
│  │      → [fallback] create-asaas-pix                     │        │
│  │      → PixPaymentDialog                                │        │
│  │                                                        │        │
│  │  selectedPayment === 'credit_card'                     │        │
│  │    → CreditCardForm (inline)                           │        │
│  │    → Asaas JS SDK tokenize (se novo cartão)            │        │
│  │    → create-payment-asaas                              │        │
│  │      → se recusado: NÃO rollback, salva attempts       │        │
│  │      → redireciona para /conta com estado              │        │
│  │                                                        │        │
│  │  'mercado_pago' → removido                             │        │
│  └──────────────────────────────────────────────────────┘        │
│                                                                   │
│  ┌──────────────────────────────────────────────────────┐        │
│  │  Conta.tsx (MODIFICAR — seção "Pedidos Pendentes")     │        │
│  │                                                        │        │
│  │  Lista orders com status = 'aguardando_pagamento'      │        │
│  │  Para cada pedido:                                     │        │
│  │    ├── Se PIX com pix_expiration válido:               │        │
│  │    │     → "Ver PIX" → abre PixPaymentDialog           │        │
│  │    │       (re-exibe QR Code salvo no banco)           │        │
│  │    ├── Se PIX expirado:                                │        │
│  │    │     → "Gerar novo PIX" → refresh-pix              │        │
│  │    ├── Se cartão recusado (attempts < 3):              │        │
│  │    │     → "Tentar novamente" → retry-payment-asaas    │        │
│  │    │     → OU "Pagar com PIX"                          │        │
│  │    └── Se expirou (24h):                               │        │
│  │          → "Cancelado" (status já atualizado)          │        │
│  └──────────────────────────────────────────────────────┘        │
│                                                                   │
│  ┌──────────────────────────────────────────────────────┐        │
│  │  CreditCardForm.tsx (NOVO)                            │        │
│  │  Props:                                               │        │
│  │    amount: number                                      │        │
│  │    savedCards: SavedMethod[]                           │        │
│  │    selectedCardId: string | null                       │        │
│  │    onCardSelect: (id) => void                          │        │
│  │    onSubmitCardData: (cardData: CreditCardFormData, saveCard: boolean) => void │
│  │    onError: (msg) => void                              │        │
│  │    onInstallmentChange: (count) => void                │        │
│  │    loading: boolean                                    │        │
│  │                                                        │        │
│  │  Estados internos:                                     │        │
│  │    formMode: 'saved' | 'new'                           │        │
│  │    cardNumber, holderName, expiry, cvv                 │        │
│  │    saveCard: boolean (checkbox)                        │        │
│  │    brand: string (detectado)                           │        │
│  │    installments: number                                │        │
│  │                                                        │        │
│  │  Envio: formData → edge function → POST /v3/payments   │        │
│  │  (sem SDK — tokenização é server-side)                 │        │
│  └──────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     Edge Functions (Deno)                         │
│                                                                   │
│  create-abacatepay-pix  (MODIFICAR — idempotente)                 │
│    Se order já tem payment_id + qr_code + pix_válido:             │
│      → Retorna QR existente (não cria novo)                      │
│    POST /v2/transparents/create (AbacatePay)                      │
│                                                                   │
│  create-asaas-pix  (NOVA)                                         │
│    POST /v3/payments (Asaas, billingType=PIX)                     │
│    → Cria cliente Asaas se não existir                            │
│    → Cria cobrança PIX, retorna QR Code + expiresAt               │
│                                                                   │
│  create-payment-asaas  (NOVA)                                     │
│    POST /v3/payments (Asaas, billingType=CREDIT_CARD)             │
│    → Cria/obtém customer Asaas por CPF                            │
│    → Se saveCard=true e aprovado: token já vem na resposta        │
│    → Se recusado: incrementa payment_attempts, NÃO deleta order   │
│    → Retorna { success, payment, cardInfo? }                      │
│                                                                   │
│  retry-payment-asaas  (NOVA)                                      │
│    Similar a create-payment-asaas, mas recebe orderId já existente│
│    → Verifica se attempts < 3                                     │
│    → Cria NOVO payment no Asaas (novo creditCardToken)            │
│    → Atualiza asaas_payment_id, incrementa attempts               │
│    → Retorna resultado                                            │
│                                                                   │
│  refresh-pix  (NOVA)                                              │
│    → Para PIX expirado: cancela payment antigo no gateway?        │
│    → Cria novo PIX (AbacatePay try → Asaas fallback)             │
│    → Atualiza qr_code, pix_expiration na order                    │
│                                                                   │
│  get-order-payment  (NOVA)                                        │
│    → Retorna dados de pagamento de um pedido (p/ /conta)          │
│    → Inclui: qr_code, pix_expiration, status, attempts, métodos   │
│    → Não expõe dados sensíveis                                    │
│                                                                   │
│  asaas-webhook  (NOVA)                                            │
│    → Recebe PAYMENT_CONFIRMED / RECEIVED / REFUNDED               │
│    → Atualiza order + ações pós-pagamento                         │
│                                                                   │
│  auto-cancel-orders  (NOVA — cron job)                            │
│    → Executa a cada 5 min (Supabase scheduled function)           │
│    → Busca orders aguardando_pagamento com TTL expirado           │
│    → Atualiza status = 'cancelado'                                │
│    → Envia e-mail de notificação                                  │
│                                                                   │
│  verify-payment  (MODIFICAR)                                      │
│    → Adicionar rota Asaas: GET /v3/payments/{asaasPaymentId}      │
│                                                                   │
│  abacatepay-webhook  (já existe — inalterado)                     │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                        Banco de Dados                             │
│                                                                   │
│  profiles:                                                        │
│    + asaas_customer_id: text (nullable)                           │
│                                                                   │
│  orders:                                                          │
│    + asaas_payment_id: text (nullable)                            │
│    + payment_gateway: text (nullable) → 'abacatepay' | 'asaas'    │
│    + payment_attempts: integer (default 0) — nº de tentativas     │
│    + last_payment_attempt_at: timestamptz (nullable)              │
│    + payment_due_at: timestamptz (nullable) — data limite p/ pagar│
│                                                                   │
│  saved_payment_methods:                                           │
│    + asaas_credit_card_token: text (nullable)                     │
│                                                                   │
│  🗑️ As colunas card_exp_month, card_exp_year em                   │
│     saved_payment_methods já existem e serão populadas            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 1. Configuração

### Variáveis de ambiente

**`supabase/functions/.env`:**
```env
ASAAS_API_KEY=
ASAAS_ENVIRONMENT=sandbox
```

**`src/config/constants.ts`** — adicionar:
```ts
export const ASAAS_CONFIG = {
  PUBLIC_KEY: import.meta.env.VITE_ASAAS_PUBLIC_KEY ?? '',
  ENVIRONMENT: import.meta.env.VITE_ASAAS_ENVIRONMENT ?? 'sandbox',
  BASE_URL: import.meta.env.VITE_ASAAS_ENVIRONMENT === 'production'
    ? 'https://api.asaas.com'
    : 'https://sandbox.asaas.com',
} as const;

export const PAYMENT_CONFIG = {
  PIX_EXPIRATION_MINUTES: 30,
  STOCK_RESERVE_TTL_MINUTES: 30,
  CARD_RETRY_MAX_ATTEMPTS: 3,
  CARD_RETRY_WINDOW_MINUTES: 10,
  PENDING_ORDER_CANCEL_HOURS: 24,
  POLLING_INTERVAL_MS: 5000,
  POLLING_MAX_MINUTES: 15,
} as const;
```

### SDK Asaas

Carregar dinamicamente no `CreditCardForm.tsx`:
```ts
const loadAsaasSdk = () => new Promise<void>((resolve, reject) => {
  if (window.AsaasCreditCard) return resolve();
  const script = document.createElement('script');
  script.src = 'https://assets.asaas.com/assets/asaas.js';
  script.onload = () => resolve();
  script.onerror = () => reject(new Error('Falha ao carregar SDK Asaas'));
  document.head.appendChild(script);
});
```

---

## 2. Migração SQL

Arquivo: `supabase/migrations/YYYYMMDDHHMMSS_add_asaas_fields.sql`

```sql
-- Asaas customer ID vinculado ao perfil do usuário
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS asaas_customer_id text;

-- Identificador do pagamento no Asaas + qual gateway processou
ALTER TABLE orders ADD COLUMN IF NOT EXISTS asaas_payment_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_gateway text;

-- Controle de retentativa de pagamento
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_attempts integer DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_payment_attempt_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_due_at timestamptz;

-- Token reutilizável Asaas (retornado após pagamento ou via tokenize)
ALTER TABLE saved_payment_methods ADD COLUMN IF NOT EXISTS asaas_credit_card_token text;

-- Índice para busca de pedidos pendentes
CREATE INDEX IF NOT EXISTS idx_orders_pending_payment
  ON orders (status, created_at)
  WHERE status = 'aguardando_pagamento';
```

---

## 3. Componente Novo: `CreditCardForm.tsx`

### Layout

```
┌──────────────────────────────────────────────────┐
│ 💳 Cartão de Crédito                             │
│                                                    │
│ ── Seus cartões salvos ──────────────────────     │
│                                                    │
│ ○ Visa •••• 0010 · João Silva · 12/30             │
│ ○ Master •••• 8884 · João Silva · 08/29           │
│ ● [+} Usar novo cartão                            │
│                                                    │
│ ── Dados do cartão ───────────────────────────     │
│                                                    │
│ Número do cartão                      [VISA]      │
│ ┌──────────────────────────────────────┐          │
│ │ 4242 4242 4242 4242                  │          │
│ └──────────────────────────────────────┘          │
│                                                    │
│ Nome do titular                                    │
│ ┌──────────────────────────────────────┐          │
│ │ João Silva                           │          │
│ └──────────────────────────────────────┘          │
│                                                    │
│ Validade          CVV                              │
│ ┌────────────┐  ┌────────┐                        │
│ │ 12/30      │  │ 123    │                        │
│ └────────────┘  └────────┘                        │
│                                                    │
│ ☐ Salvar cartão para compras futuras               │
│                                                    │
│ Parcelamento (até 10x sem juros)                   │
│ ┌──────────────────────────────────────┐          │
│ │ 3x de R$ 50,00                  ▼    │          │
│ └──────────────────────────────────────┘          │
└──────────────────────────────────────────────────┘
```

Quando um cartão salvo é selecionado:

```
┌──────────────────────────────────────────────────┐
│ 💳 Cartão de Crédito                             │
│                                                    │
│ ── Seus cartões salvos ──────────────────────     │
│                                                    │
│ ● Visa •••• 0010 · João Silva · 12/30             │
│ ○ Master •••• 8884 · João Silva · 08/29           │
│ ○ [+} Usar novo cartão                            │
│                                                    │
│ Visa •••• 0010  |  João Silva  |  12/30           │
│                                                    │
│ Parcelamento (até 10x sem juros)                   │
│ ┌──────────────────────────────────────┐          │
│ │ 3x de R$ 50,00                  ▼    │          │
│ └──────────────────────────────────────┘          │
│                                                    │
│ [ 💳 Pagar R$ 150,00 ]                             │
└──────────────────────────────────────────────────┘
```

> **Nota:** Quando usando cartão salvo, o CVV não é necessário — o Asaas processa com o token reutilizável sem exigir CVV novamente.

### Props

```ts
interface CreditCardFormProps {
  amount: number; // valor total em reais (ex: 150.00)
  savedCards: Array<{
    id: string;
    card_brand: string | null;
    card_last4: string | null;
    cardholder_name: string | null;
    card_exp_month: string | null;
    card_exp_year: string | null;
    asaas_credit_card_token: string | null;
  }>;
  selectedCardId: string | null;
  onCardSelect: (id: string | null) => void; // null = novo cartão
  onTokenGenerated: (token: string, saveCard: boolean) => void;
  onError: (error: string) => void;
  onInstallmentChange: (count: number) => void;
  loading: boolean;
}
```

### Estados internos

```ts
const [formMode, setFormMode] = useState<'new' | 'saved'>('saved');
const [cardNumber, setCardNumber] = useState('');
const [holderName, setHolderName] = useState('');
const [expiry, setExpiry] = useState(''); // MM/AA
const [cvv, setCvv] = useState('');
const [saveCard, setSaveCard] = useState(false); // checkbox, default OFF
const [brand, setBrand] = useState<string | null>(null);
const [maskedNumber, setMaskedNumber] = useState('');
```

### Tokenização

```ts
const handleTokenize = async () => {
  await loadAsaasSdk();

  const creditCard = new window.AsaasCreditCard({
    holderName,
    number: cardNumber.replace(/\s/g, ''),
    expiryMonth: expiry.split('/')[0],
    expiryYear: `20${expiry.split('/')[1]}`,
    ccv: cvv,
  });

  creditCard.tokenize((error: any, response: any) => {
    if (error) return onError('Erro ao validar cartão');
    onTokenGenerated(response.creditCardToken, saveCard);
  });
};
```

---

## 4. Edge Functions Novas

### 4.1. `create-payment-asaas`

**Recebe:**
```json
{
  "orderId": "uuid",
  "creditCardToken": "tok_xxx",
  "installmentCount": 3,
  "saveCard": false,
  "customerData": {
    "name": "João Silva",
    "email": "joao@email.com",
    "cpfCnpj": "12345678901",
    "phone": "66999999999"
  },
  "address": {
    "postalCode": "78556100",
    "street": "Rua X, 123",
    "number": "123",
    "complement": "Apto",
    "neighborhood": "Centro",
    "city": "Sinop",
    "state": "MT"
  }
}
```

**Processo:**
```
1. Autenticar JWT → obter user
2. Verificar order (ownership + total_amount)
3. Buscar/criar Customer Asaas:
     profiles.asaas_customer_id existe?
       → Sim: GET /v3/customers/{id}
       → Não: POST /v3/customers → salvar asaas_customer_id em profiles
4. POST /v3/payments (Asaas):
   {
     "customer": "cus_xxx",
     "billingType": "CREDIT_CARD",
     "value": 150.00,
     "dueDate": today,
     "installmentCount": 3,
     "creditCardToken": "tok_xxx",
     "creditCardHolderInfo": { name, email, cpfCnpj, postalCode, addressNumber, phone },
     "remoteIp": "..."
   }
5. Processar resposta:
   ├── HTTP 200 (aprovado):
   │     UPDATE orders SET
   │       status = 'em_preparo',
   │       asaas_payment_id = response.id,
   │       payment_method = 'credit_card',
   │       payment_gateway = 'asaas',
   │       card_brand = response.creditCardBrand,
   │       card_last_digits = response.creditCardNumber (last 4)
   │     Se saveCard=true:
   │       → Incluir creditCardToken (reutilizável) no response
   │     Retornar { success: true, payment, cardInfo? }
   │
   └── HTTP 400 (recusado):
         NÃO deleta order
         UPDATE orders SET
           payment_attempts = payment_attempts + 1,
           last_payment_attempt_at = now()
         Retornar { success: false, error: "Cartão recusado." }
```

**Resposta sucesso:**
```json
{
  "success": true,
  "payment": {
    "id": "pay_xxxxxxxxxxxx",
    "status": "CONFIRMED",
    "installments": 3,
    "value": 15000,
    "netValue": 14250
  },
  "cardInfo": {
    "brand": "VISA",
    "last4": "0010",
    "creditCardToken": "76496073-536f-4835-80db-c45d00f33695",
    "cardExpiryMonth": "12",
    "cardExpiryYear": "2030"
  }
}
```

**Resposta erro:**
```json
{
  "success": false,
  "error": "Cartão recusado. Verifique os dados e tente novamente.",
  "attemptsRemaining": 2
}
```

### 4.2. `retry-payment-asaas`

**Propósito:** Usado em `/conta` quando o usuário quer tentar novamente com outro cartão.

**Diferenças de `create-payment-asaas`:**
- Recebe `orderId` em vez de criar ordem nova
- Verifica `payment_attempts < 3` e `last_payment_attempt_at` dentro da janela
- Cria **novo** payment no Asaas (mesmo customer, novo token de cartão)
- Atualiza `asaas_payment_id` (substitui o anterior recusado)
- Incrementa `payment_attempts`

**Recebe:**
```json
{
  "orderId": "uuid",
  "creditCardToken": "tok_xxx",
  "installmentCount": 3,
  "saveCard": false,
  "customerData": { ... },
  "address": { ... }
}
```

**Processo:**
```
1. Autenticar
2. Verificar order: status = 'aguardando_pagamento'
3. Verificar attempts:
     attempts >= 3? → Erro: "Número máximo de tentativas atingido"
     last_attempt < 10 min atrás? → OK
4. Mesmo fluxo de create-payment-asaas (step 3-5)
```

### 4.3. `create-asaas-pix`

**Recebe:**
```json
{
  "orderId": "uuid"
}
```

**Processo:**
```
1. Autenticar
2. Verificar order
3. Buscar/criar Customer Asaas
4. POST /v3/payments:
   {
     "customer": "cus_xxx",
     "billingType": "PIX",
     "value": 150.00,
     "dueDate": today,
     "externalReference": "order-uuid"
   }
5. Salvar na order:
     asaas_payment_id = response.id
     payment_method = 'pix'
     payment_gateway = 'asaas'
     qr_code = response.pixQrCode || response.pixCopiaECola
     qr_code_base64 = response.pixBase64
     pix_expiration = response.pixExpirationDate
     payment_due_at = now() + 30 min
6. Retornar QR Code
```

### 4.4. `refresh-pix`

**Propósito:** Renovar QR Code PIX expirado sem recriar o pedido.

**Processo:**
```
1. Autenticar
2. Verificar order (status = 'aguardando_pagamento')
3. Se payment_gateway = 'asaas' e asaas_payment_id existe:
     → O Asaas não permite "renovar" PIX — cria-se novo payment
     → Opcional: cancelar payment antigo via Asaas (se suportado)
4. Tenta AbacatePay → se falhar, Asaas fallback
5. Atualiza qr_code, pix_expiration, asaas_payment_id na order
6. Retorna novos dados
```

### 4.5. `get-order-payment`

**Propósito:** Fornecer ao frontend os dados de pagamento de um pedido pendente (para exibir em `/conta`).

**Recebe:**
```json
{
  "orderId": "uuid"
}
```

**Retorna:**
```json
{
  "success": true,
  "data": {
    "status": "aguardando_pagamento",
    "totalAmount": 150.00,
    "paymentMethod": "pix",
    "paymentGateway": "abacatepay",
    "qrCode": "000201...",
    "qrCodeBase64": "iVBORw...",
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

### 4.6. `auto-cancel-orders` — **NÃO CRIAR** (reaproveitar `cancel-expired-orders`)

> ❌ Esta edge function **não deve ser criada** — a função `cancel-expired-orders` já existe na codebase e implementa a mesma lógica (cancelamento de pedidos `aguardando_pagamento` > 24h, liberação de estoque, restauração de stock, liberação de slots de promoção, envio de e-mail). Apenas estender com validações específicas do Asaas se necessário.

```ts
// Já existe em: supabase/functions/cancel-expired-orders/index.ts
// Acionado via cron job com CRON_SECRET.
```

### 4.7. `asaas-webhook`

> ⚠️ **Autenticação:** O webhook Asaas usa `asaas-access-token` (authToken), não HMAC. Deve ser validado comparando o header com o token fixo cadastrado no painel Asaas.
>
> ⚠️ **Idempotência:** Asaas garante *at least once delivery* — eventos podem ser duplicados. Deduplicar pelo campo `id` do payload. Responder HTTP 200 em até 10s.

**Eventos tratados:**

| Evento Asaas | Significado | Ação |
|-------------|------------|------|
| `PAYMENT_CREATED` | Cobrança criada | Log; pedido já está `aguardando_pagamento` |
| `PAYMENT_CONFIRMED` | Pagamento confirmado (cartão: autorizado) | `order.status = 'em_preparo'` + subtrair estoque + NF-e + etiqueta + e-mail |
| `PAYMENT_RECEIVED` | Dinheiro creditado (PIX: imediato; cartão: ~30 dias) | Atualizar `payment_received_at`; conciliação financeira |
| `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` | Cartão recusado na captura | Incrementar `payment_attempts`; notificar usuário |
| `PAYMENT_REFUNDED` | Estorno concluído | `order.status = 'cancelado'` + registrar em `payment_refunds` |
| `PAYMENT_OVERDUE` | Cobrança vencida sem pagamento | Log (pedido continua `aguardando_pagamento` — PIX expirou) |
| `PAYMENT_DELETED` | Cobrança removida | Se pedido ativo, reavaliar; se cancelado, ignorar |
| `PAYMENT_AWAITING_RISK_ANALYSIS` | Em análise de risco | Log; aguardar outcome |
| `PAYMENT_APPROVED_BY_RISK_ANALYSIS` | Aprovado na análise | Tratar como `PAYMENT_CONFIRMED` |
| `PAYMENT_REPROVED_BY_RISK_ANALYSIS` | Reprovado na análise | Incrementar `payment_attempts`; notificar usuário |
| `PAYMENT_RESTORED` | Cobrança restaurada | Reavaliar status do pedido |

---

## 5. Modificações em Componentes Existentes

### 5.1. `src/pages/CheckoutEntrega.tsx`

#### a) Modificar `handleFinalizeOrder` — Cartão de Crédito (sem rollback)

```ts
if (selectedPayment === 'credit_card') {
  if (!cardFormData && !selectedCardId) {
    toast.error('Preencha os dados do cartão ou selecione um cartão salvo.');
    setFinalizing(false);
    return;
  }

  const savedCard = selectedCardId
    ? savedCards.find((c) => c.id === selectedCardId)
    : null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, cpf, phone')
    .eq('id', user!.id)
    .single();

  const address = selectedOption !== 'pickup' ? selectedAddress : null;

  // Fluxo: cartão salvo → token; cartão novo → dados brutos
  const body: any = {
    orderId: orderData.id,
    installmentCount: installments,
    saveCard: shouldSaveCard && !savedCard,
    customerData: {
      name: profile?.full_name || user?.user_metadata?.name || '',
      email: user?.email || '',
      cpfCnpj: profile?.cpf || '',
      phone: profile?.phone || '',
    },
    address: address ? {
      postalCode: address.cep,
      street: address.street,
      number: address.number,
      complement: address.complement || '',
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
    } : undefined,
  };

  if (savedCard?.asaas_credit_card_token) {
    body.creditCardToken = savedCard.asaas_credit_card_token;
  } else {
    // Envia dados brutos do cartão (server-side)
    body.creditCard = cardFormData;
    body.remoteIp = null; // Edge function obtém do header
  }

  if (paymentError || !paymentResult?.success) {
    // NÃO faz rollback — pedido continua aguardando_pagamento
    // O usuário pode tentar novamente em /conta
    toast.error(paymentResult?.error || 'Cartão recusado. Você pode tentar novamente em seus pedidos.');
    navigate('/conta?payment=declined');
    return;
  }

  // Pagamento aprovado
  if (paymentResult.cardInfo && shouldSaveCard) {
    await supabase.from('saved_payment_methods').insert({
      user_id: user!.id,
      payment_method: 'credit_card',
      card_brand: paymentResult.cardInfo.brand,
      card_last4: paymentResult.cardInfo.last4,
      cardholder_name: profile?.full_name || '',
      card_exp_month: paymentResult.cardInfo.cardExpiryMonth,
      card_exp_year: paymentResult.cardInfo.cardExpiryYear,
      asaas_credit_card_token: paymentResult.cardInfo.creditCardToken,
      is_default: savedCards.length === 0,
    });
    loadSavedCards();
  }

  toast.success('✅ Pagamento aprovado!');
  navigate('/conta');
  return;
}
```

### 5.2. `src/pages/Account.tsx` — Seção "Pedidos Pendentes"

**Nova seção na página de conta do usuário** que lista pedidos `aguardando_pagamento` com ações contextuais.

**Layout:**
```
┌──────────────────────────────────────────────────┐
│ ⏳ Pedidos aguardando pagamento                   │
│                                                    │
│ ┌──────────────────────────────────────────────┐  │
│ │ Pedido #abc123 · R$ 150,00                    │  │
│ │ 💳 Cartão recusado · 1 tentativa              │  │
│ │                                               │  │
│ │ [ Tentar novamente ]  [ Pagar com PIX ]       │  │
│ └──────────────────────────────────────────────┘  │
│                                                    │
│ ┌──────────────────────────────────────────────┐  │
│ │ Pedido #def456 · R$ 89,90                     │  │
│ │ PIX gerado · Expira em 25 min                 │  │
│ │                                               │  │
│ │ [ Ver QR Code PIX ]                           │  │
│ └──────────────────────────────────────────────┘  │
│                                                    │
│ ┌──────────────────────────────────────────────┐  │
│ │ Pedido #ghi789 · R$ 200,00                    │  │
│ │ 🔴 PIX expirado                               │  │
│ │                                               │  │
│ │ [ Gerar novo PIX ]                            │  │
│ └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

**Lógica de cada card:**
```tsx
{/* Para cada pedido pendente */}
{order.payment_method === 'pix' && order.qr_code ? (
  order.pix_expiration > new Date().toISOString() ? (
    <>
      <p>PIX gerado · Expira em {formatTimeLeft(order.pix_expiration)}</p>
      <Button onClick={() => openPixDialog(order)}>Ver QR Code PIX</Button>
    </>
  ) : (
    <>
      <p className="text-destructive">🔴 PIX expirado</p>
      <Button onClick={() => refreshPix(order.id)}>Gerar novo PIX</Button>
    </>
  )
) : (
  <>
    <p>💳 Cartão recusado · {order.payment_attempts} tentativa(s)</p>
    <div className="flex gap-2">
      {order.payment_attempts < 3 && (
        <Button onClick={() => retryCard(order.id)}>Tentar novamente</Button>
      )}
      <Button variant="outline" onClick={() => payWithPix(order.id)}>
        Pagar com PIX
      </Button>
    </div>
  </>
)}
```

### 5.3. `src/components/PixPaymentDialog.tsx`

**Modificações:**
- Receber `gateway?: 'abacatepay' | 'asaas'`
- Receber `orderId` (já tem)
- Se chamado de `/conta` com dados já existentes (qr_code carregado do banco), não precisa de edge function
- Polling a cada 5s por até 15 min
- Se expirar: exibir "PIX expirado" com botão "Gerar novo QR"

### 5.4. `supabase/functions/verify-payment/index.ts`

Adicionar rota para Asaas (já descrito no plano anterior — manter).

---

## 6. Gerenciamento de Cartões Salvos

### Estrutura

A tabela `saved_payment_methods` (já existe) ganha coluna `asaas_credit_card_token`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid | PK |
| `user_id` | uuid | FK auth.users |
| `payment_method` | text | `'credit_card'` |
| `card_brand` | text | `'VISA'`, `'MASTERCARD'`, etc. |
| `card_last4` | text | Últimos 4 dígitos |
| `cardholder_name` | text | Nome do titular |
| `card_exp_month` | text | Mês validade |
| `card_exp_year` | text | Ano validade |
| `asaas_credit_card_token` | text | Token reutilizável Asaas |
| `is_default` | boolean | Cartão padrão |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `last_used_at` | timestamptz | |

### Fluxo de salvamento

```
Pagamento aprovado + saveCard=true
  → Edge function create-payment-asaas retorna cardInfo com creditCardToken
  → Frontend insere em saved_payment_methods
  → Lista é recarregada (loadSavedCards)
```

### Fluxo de exclusão (fase futura)

- Usuário pode remover cartão da lista na página `/conta`
- Exclusão é apenas local (DELETE em `saved_payment_methods`)
- Token Asaas continua existindo no customer, mas não referenciado

---

## 7. Lógica de Parcelamento (até 10x sem juros)

```ts
const totalValue = total + displayFreteValor;
const minInstallmentValue = 5; // R$ 5 mínimo por parcela
const maxInstallments = Math.min(10, Math.floor(totalValue / minInstallmentValue));

const installmentOptions = [];
for (let i = 1; i <= maxInstallments; i++) {
  const value = totalValue / i;
  installmentOptions.push({
    count: i,
    value: value,
    total: totalValue,
    label: `${i}x de R$ ${value.toFixed(2).replace('.', ',')}${i === 1 ? ' à vista' : ' sem juros'}`,
  });
}
```

> **Observação:** O Asaas processa parcelamento automaticamente. Enviamos `installmentCount` e `installmentValue` no POST `/v3/payments`. O valor total (`totalValue`) é o mesmo independente do número de parcelas (sem juros).

---

## 8. Webhooks

### AbacatePay (existente — inalterado)

- `abacatepay-webhook` continua processando `transparent.completed`
- Apenas PIX AbacatePay passa por aqui

### Asaas (novo)

- `asaas-webhook` processa eventos de pagamento Asaas
- Para PIX Asaas (fallback) e cartão de crédito
- Deve executar ações pós-pagamento completas:
  - Subtrair estoque real
  - Emitir NF-e
  - Gerar etiqueta Melhor Envio
  - E-mail de confirmação

---

## 9. Ordem de Implementação

| Fase | Tarefa | Depende |
|------|--------|---------|
| **0** | **Corrigir bugs existentes no AbacatePay** (7 bugs: HMAC, polling, externalId, platformFee, expiresIn, receiptUrl, idempotência) | — |
| **1** | Conta Asaas sandbox + obter chaves | — |
| **2** | Migration SQL completa (colunas Asaas + `platform_fee` + `receipt_url` + `webhook_events`) | — |
| **3** | Edge function `create-payment-asaas` (cria customer + processa cartão, sem rollback) | 1, 2 |
| **4** | Edge function `create-asaas-pix` (fallback PIX) | 1, 2 |
| **5** | Componente `CreditCardForm.tsx` (formulário inline, envia dados brutos para edge function) | 1 |
| **6** | Modificar `CheckoutEntrega.tsx`: integrar CreditCardForm, remover Mercado Pago, remover checkout AbacatePay cartão | 3, 5 |
| **7** | Modificar `CheckoutEntrega.tsx`: fallback PIX automático | 4 |
| **8** | Edge function `retry-payment-asaas` (retentativa em /conta) | 3 |
| **9** | Edge function `refresh-pix` (renovar QR Code expirado) | 4 |
| **10** | Edge function `get-order-payment` (dados de pagamento p/ /conta) | 3, 4 |
| **11** | Modificar `PixPaymentDialog` + `verify-payment` para suporte Asaas e AbacatePay (BUG-002) | 4 |
| **12** | Modificar `Account.tsx` — seção "Pedidos Pendentes" com ações | 8, 9, 10 |
| **13** | Edge function `asaas-webhook` (ações pós-pagamento completas) | 3 |
| **14** | Estender `cancel-expired-orders` (já existente) com validações específicas do Asaas | 2 |
| **15** | Testar fluxo completo | 0, 6, 7, 11, 12, 13 |
| **16** | Configurar produção (ativar tokenização Asaas, webhook real, cron job) | 15 |

---

## 10. Cartões de Teste (Sandbox Asaas)

| Finalidade | Bandeira | Número | Resultado |
|-----------|----------|--------|-----------|
| Aprovado | Visa | `4000000000000010` | ✅ |
| Aprovado | Mastercard | `5555666677778884` | ✅ |
| Recusado | Visa | `4000000000000002` | ❌ |

Qualquer data futura, CVV 123, nome qualquer.

---

## 11. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Tokenização não ativada em produção | Cartão não funciona | Solicitar ativação ao suporte Asaas com antecedência |
| HMAC quebrado no webhook AbacatePay | Assinatura nunca valida — segurança bypass | Corrigido na Fase 0 (BUG-001): adicionar `await` no `crypto.subtle.sign` |
| Polling AbacatePay não funciona | Confirmação em tempo real quebrada | Corrigido na Fase 0 (BUG-002): `verify-payment` estendida para `GET /v2/transparents/check` |
| AbacatePay fora do ar | PIX principal quebra | Fallback automático para Asaas PIX |
| Usuário fecha o navegador antes de pagar | Pedido fica pendente | QR Code acessível em /conta; auto-cancelamento após 24h |
| Usuário tenta pagar PIX expirado | Erro no gateway | refresh-pix: cria novo QR sem recriar pedido |
| Múltiplas tentativas de cartão recusadas | Frustração | Limite de 3 tentativas em 10 min; sugerir PIX |
| Webhook + polling simultâneos | Order atualizada 2x | Atualização idempotente com guard de status |

---

## 12. Diagrama de Arquivos

```
src/
├── components/
│   ├── CreditCardForm.tsx          ← NOVO
│   └── PixPaymentDialog.tsx        ← MODIFICAR
├── config/
│   └── constants.ts                ← MODIFICAR
├── pages/
│   ├── CheckoutEntrega.tsx         ← MODIFICAR
│   └── Account.tsx                 ← MODIFICAR (seção pedidos pendentes)
└── integrations/
    └── supabase/
        └── client.ts               ← (inalterado)

supabase/
├── migrations/
│   └── YYYYMMDDHHMMSS_add_asaas_fields.sql  ← NOVO
└── functions/
    ├── create-payment-asaas/       ← NOVO
    ├── create-asaas-pix/           ← NOVO
    ├── retry-payment-asaas/        ← NOVO
    ├── refresh-pix/                ← NOVO
    ├── get-order-payment/          ← NOVO
    ├── asaas-webhook/              ← NOVO (delega pós-pagamento para _shared/ ou payment-webhook existente)
    ├── _shared/asaasCustomer.ts    ← NOVO
    ├── verify-payment/             ← MODIFICAR
    ├── cancel-expired-orders/      ← (existente — já faz auto-cancelamento 24h)
    ├── create-abacatepay-pix/      ← (inalterado)
    └── abacatepay-webhook/         ← (inalterado)
```

---

## 13. Considerações Finais

- **Tokenização**: É **server-side**, via API Asaas (`POST /v3/creditCard/tokenizeCreditCard`). NÃO existe SDK JS client-side. Os dados do cartão trafegam do frontend para a edge function (HTTPS obrigatório), que chama o Asaas. Essa abordagem exige certificação **SAQ-D** (PCI-DSS), não SAQ-A.
- **Salvamento explícito**: Checkbox "Salvar cartão para compras futuras" desligado por padrão. Cartão só é salvo após pagamento aprovado.
- **Persistência**: Pedidos com cartão recusado NÃO são deletados — ficam em `aguardando_pagamento` com contagem de tentativas. O usuário pode retentar em `/conta` com limite de 3 tentativas.
- **PIX expirado**: Se o QR Code expirar, o usuário pode gerar um novo sem recriar o pedido, via `refresh-pix`.
- **Auto-cancelamento**: Pedidos não pagos em 24h são cancelados automaticamente por cron job.
- **Múltiplos cartões**: Como o Asaas não expõe API para listar/gerenciar cartões salvos, gerenciamos a lista localmente em `saved_payment_methods`. O usuário pode ter quantos cartões quiser.
- **Token exclusivo por customer**: O token Asaas é vinculado ao customer (CPF). Não pode ser usado para outro cliente.
- **Produção**: A tokenização precisa ser ativada pelo suporte Asaas em produção.
