# Guia: Testes de Pagamento em Sandbox

Teste ponta a ponta dos gateways de pagamento usando sandbox + ngrok para webhooks locais.

---

## Arquitetura

```
ngrok (https://abc123.ngrok-free.app)
  │
  └─► localhost:54321 (Supabase local)
        ├─ /functions/v1/payment-webhook        ← Mercado Pago
        └─ /functions/v1/asaas-webhook          ← Asaas

Frontend: localhost:8080 (Vite)
  ├─ create-mercadopago-pix   ← PIX < R$ 201
  ├─ create-asaas-pix         ← PIX >= R$ 201
  └─ create-payment-asaas     ← Cartão de crédito
```

---

## Variáveis de ambiente

Crie (ou edite) o arquivo `supabase/functions/.env`:

```bash
# ── Asaas (sandbox) ──────────────────────────────────────────────
ASAAS_API_KEY=$aact_YTU5YTE0M2M2N2I4MTliNzk0...
ASAAS_ENVIRONMENT=sandbox
ASAAS_WEBHOOK_AUTH_TOKEN=seu-token-de-webhook-aqui

# ── Mercado Pago (sandbox) ───────────────────────────────────────
MERCADO_PAGO_ACCESS_TOKEN=TEST-1234567890123456-123456...
MERCADO_PAGO_PUBLIC_KEY=TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MERCADO_PAGO_WEBHOOK_SECRET=sua-chave-secreta-aqui
```

> **Importante**: tokens de sandbox SEMPRE começam com `$aact_` (Asaas) ou `TEST-` (Mercado Pago). Tokens de produção NUNCA devem estar neste arquivo.

---

## Obtendo credenciais

### Asaas

1. Acesse [sandbox.asaas.com](https://sandbox.asaas.com) e crie uma conta de teste
2. Vá em **Integrações > API** e copie a **API Key** (formato `$aact_...`)
3. Em **Webhooks**, configure um token de autenticação (`asaas-access-token`) e copie-o para `ASAAS_WEBHOOK_AUTH_TOKEN`
4. A URL do webhook será configurada depois (Passo 3)

### Mercado Pago

1. Acesse [Mercado Pago Developers](https://www.mercadopago.com.br/developers/panel/app) e crie um app
2. Em **Credenciais de teste**, copie:
   - **Access Token** (formato `TEST-...`)
   - **Public Key** (formato `TEST-...`)
3. Em **Webhooks > Configurar**, gere uma chave secreta e copie-a para `MERCADO_PAGO_WEBHOOK_SECRET`
4. A URL do webhook será configurada depois (Passo 3)

---

## Passo a passo

### Passo 1: Iniciar Supabase local

```bash
# Terminal 1
cd /Users/gustavo/Projects/pescaria-japonesa-artigos
supabase start
```

Isso expõe:
- Edge Functions: `http://127.0.0.1:54321`
- Supabase Studio: `http://127.0.0.1:54323`
- Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

### Passo 2: Iniciar ngrok

```bash
# Terminal 2
ngrok http 54321
```

O ngrok mostra uma URL pública:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:54321
```

Anote essa URL — você vai usá-la no próximo passo.

> **Dica**: instale o ngrok com `brew install ngrok` se ainda não tiver. Crie uma conta gratuita em [ngrok.com](https://ngrok.com) e configure o token com `ngrok config add-authtoken <seu-token>`.

### Passo 3: Configurar webhooks nos gateways

#### Asaas

No painel do [sandbox.asaas.com](https://sandbox.asaas.com) → Integrações → Webhooks:

| Campo | Valor |
|-------|-------|
| URL | `https://abc123.ngrok-free.app/functions/v1/asaas-webhook` |
| Token de autenticação | `asaas-access-token: seu-token-de-webhook-aqui` |
| Eventos | `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE` |

> ⚠️ O ngrok é instável com free tier — a URL muda a cada restart. Reconfigure o webhook se o ngrok reiniciar.

#### Mercado Pago

No painel do [Mercado Pago Developers](https://www.mercadopago.com.br/developers/panel/app) → Webhooks:

| Campo | Valor |
|-------|-------|
| URL | `https://abc123.ngrok-free.app/functions/v1/payment-webhook` |
| Eventos | `payments` |
| Modo | Produção (não se engane — o token `TEST-` garante sandbox) |

### Passo 4: Iniciar frontend

```bash
# Terminal 3
npm run dev
```

Acesse `http://localhost:8080`.

### Passo 5: Popular banco de teste (opcional)

Para testar rapidamente no Supabase Studio local (`http://127.0.0.1:54323`):

```sql
-- Criar usuário de teste
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000001', 'admin@pescaria.com', '$2a$10$...', now(), '{"provider":"email"}', '{"full_name":"Admin Teste"}');

-- Criar perfil
INSERT INTO profiles (id, full_name, cpf, phone)
VALUES ('00000000-0000-0000-0000-000000000001', 'Admin Teste', '12345678901', '66999999999');

-- Dar role admin
INSERT INTO user_roles (user_id, role) VALUES ('00000000-0000-0000-0000-000000000001', 'admin');
```

---

## Testando cada gateway

### PIX Mercado Pago (pedidos < R$ 201)

1. Adicione um produto de **até R$ 200** ao carrinho
2. Vá para `/checkout/entrega?frete=Retirar na Loja&frete_valor=0`
3. Selecione **PIX** e clique em **Finalizar pedido**
4. O dialog PIX abre com QR Code do Mercado Pago

**Verificar no banco:**
```sql
SELECT id, payment_gateway, payment_id, qr_code, status
FROM orders ORDER BY created_at DESC LIMIT 1;
-- Deve mostrar: payment_gateway = 'mercadopago'
```

### PIX Asaas (pedidos >= R$ 201)

1. Adicione um produto de **R$ 201 ou mais** ao carrinho
2. Idem fluxo acima
3. O QR Code será do Asaas

**Verificar no banco:**
```sql
-- Deve mostrar: payment_gateway = 'asaas', asaas_payment_id preenchido
```

### Cartão de crédito Asaas

1. Adicione qualquer produto ao carrinho
2. Selecione **Cartão de Crédito** e preencha:
   - Número: `4111111111111111` (Visa de teste)
   - Validade: qualquer data futura
   - CVV: `123`
3. Clique em **Finalizar pedido**

**Cartões de teste Asaas:**

| Bandeira | Número | Resultado |
|----------|--------|-----------|
| Visa | `4111111111111111` | Aprovado |
| Mastercard | `5453010000066167` | Aprovado |
| Recusado | `4111111111111129` | Negado |

---

## Simulando confirmação de pagamento

### PIX Mercado Pago

O Mercado Pago sandbox não oferece simulação de PIX diretamente. Formas de testar:

#### Opção A: API do Mercado Pago

```bash
# Pegue o PAYMENT_ID do banco
PAYMENT_ID=$(curl -s "http://127.0.0.1:54321/rest/v1/orders?select=payment_id&payment_gateway=eq.mercadopago&status=eq.aguardando_pagamento&order=created_at.desc&limit=1" \
  -H "apikey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH" | jq -r '.[0].payment_id')

echo "Payment ID: $PAYMENT_ID"

# Simular webhook (desabilitar validação HMAC no payment-webhook para teste local)
curl -X POST "http://127.0.0.1:54321/functions/v1/payment-webhook" \
  -H "Content-Type: application/json" \
  -H "x-signature: ts=12345,v1=dummy" \
  -H "x-request-id: manual-test-$(date +%s)" \
  -d "{\"type\":\"payment\",\"data\":{\"id\":\"$PAYMENT_ID\"}}"
```

> ⚠️ Para isso funcionar, desabilite temporariamente a validação HMAC em `supabase/functions/payment-webhook/index.ts:39-52`.
> **Nunca faça deploy disso para produção.**

#### Opção B: Forçar status via API

```bash
# Atualiza status do payment no Mercado Pago para "approved"
curl -X PUT "https://api.mercadopago.com/v1/payments/$PAYMENT_ID" \
  -H "Authorization: Bearer $(grep MERCADO_PAGO_ACCESS_TOKEN supabase/functions/.env | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"status":"approved"}'
```

> Este método força o status no Mercado Pago e este **deve** disparar o webhook automaticamente.
> Pode levar alguns segundos para o Mercado Pago processar e enviar o webhook.

### PIX Asaas

No painel do [sandbox.asaas.com](https://sandbox.asaas.com), vá em **Pagamentos > Pagamentos** e localize o pagamento. Você pode marcar manualmente como **Confirmado**. O Asaas enviará o webhook automaticamente.

### Cartão de crédito Asaas

A confirmação do cartão é imediata — se o número for de um cartão de teste aprovado, o webhook chega em segundos sem ação manual.

---

## Debug

### Logs das Edge Functions

```bash
# Terminal dedicado para logs
supabase functions serve --no-verify-jwt 2>&1 | grep -E 'mercadopago|asaas|webhook|refund|pix'
```

### Verificar webhook recebido

```bash
# No Terminal do ngrok, veja as requisições chegando em tempo real
# Ou acesse http://127.0.0.1:4040 (dashboard ngrok local)

# Ou veja os logs do Supabase
supabase functions serve --no-verify-jwt 2>&1 | grep "payment-webhook\|asaas-webhook"
```

### Status do pedido

```sql
-- No Supabase Studio (http://127.0.0.1:54323) ou psql
SELECT id, status, payment_gateway, payment_id, asaas_payment_id,
       created_at, pix_expiration
FROM orders
ORDER BY created_at DESC
LIMIT 5;
```

### Reembolso manual (teste)

```bash
# Pegue um JWT válido do browser (qualquer requisição autenticada) e:
curl -X POST http://127.0.0.1:54321/functions/v1/refund-payment \
  -H "Authorization: Bearer SEU_JWT_AQUI" \
  -H "Content-Type: application/json" \
  -d '{"orderId": "UUID_DO_PEDIDO"}' | jq
```

### Reembolso parcial (teste)

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/refund-payment \
  -H "Authorization: Bearer SEU_JWT_AQUI" \
  -H "Content-Type: application/json" \
  -d '{"orderId": "UUID_DO_PEDIDO", "amount": 30.00, "reason": "Devolução parcial - 1 item"}' | jq
```

---

## Checklist final

| Etapa | Como verificar | ✅ |
|-------|---------------|-----|
| Supabase local rodando | `http://127.0.0.1:54323` abre Studio | |
| ngrok tunelando | `http://127.0.0.1:4040` abre dashboard | |
| .env configurado | Tokens começam com `TEST-` ou `$aact_` | |
| Webhook Asaas | URL aponta para ngrok no painel Asaas sandbox | |
| Webhook MP | URL aponta para ngrok no painel Mercado Pago | |
| Frontend rodando | `npm run dev` na porta 8080 | |
| PIX < R$ 201 | `payment_gateway = 'mercadopago'` | |
| PIX >= R$ 201 | `payment_gateway = 'asaas'` | |
| Cartão aprovado | Status muda para `em_preparo` ou `pronto_retirada` | |
| Reembolso total | `refund-payment` sem `amount` funciona | |
| Reembolso parcial | `refund-payment` com `amount: 30.00` funciona | |
