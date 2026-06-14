# Agent Mode — Direct API Usage

When the user asks to **perform** an action (list, create, check, query, etc.) instead of **writing integration code**, execute the AbacatePay API directly via `curl`.

## Authentication

```bash
curl -s -H "Authorization: Bearer $ABACATEPAY_API_KEY" \
  https://api.abacatepay.com/v2/ENDPOINT
```

- Always ask for the API key if not provided and not found in environment variables.
- Check for `ABACATEPAY_API_KEY` in the shell environment or `.env` files before asking.

## Base URL

```
https://api.abacatepay.com/v2
```

## Response Format

All responses follow this structure:
```json
{
  "data": { },
  "error": null,
  "success": true
}
```

Monetary values are in **cents** (divide by 100 to display in BRL).

---

## Endpoints Reference

### Store

**Get store info (balance, name)**
```bash
curl -s -H "Authorization: Bearer $KEY" \
  https://api.abacatepay.com/v2/store/get | jq
```

---

### Customers

**List all customers**
```bash
curl -s -H "Authorization: Bearer $KEY" \
  https://api.abacatepay.com/v2/customers/list | jq
```

**Get a customer by ID**
```bash
curl -s -H "Authorization: Bearer $KEY" \
  https://api.abacatepay.com/v2/customers/CUSTOMER_ID | jq
```

**Create a customer**
```bash
curl -s -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "João Silva",
      "email": "joao@email.com",
      "taxId": "12345678900",
      "cellphone": "11999999999"
    }
  }' \
  https://api.abacatepay.com/v2/customers/create | jq
```

**Delete a customer**
```bash
curl -s -X DELETE -H "Authorization: Bearer $KEY" \
  https://api.abacatepay.com/v2/customers/CUSTOMER_ID | jq
```

---

### Products

**List products**
```bash
curl -s -H "Authorization: Bearer $KEY" \
  https://api.abacatepay.com/v2/products/list | jq
```

**Create a product**
```bash
curl -s -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "prod-001",
    "name": "Plano Pro",
    "price": 2990,
    "currency": "BRL"
  }' \
  https://api.abacatepay.com/v2/products/create | jq
```

**Delete a product**
```bash
curl -s -X DELETE -H "Authorization: Bearer $KEY" \
  https://api.abacatepay.com/v2/products/PRODUCT_ID | jq
```

---

### Checkouts

**Create a checkout (Pix)**
```bash
curl -s -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{"id": "PRODUCT_ID", "quantity": 1}],
    "customer": {
      "name": "João Silva",
      "email": "joao@email.com",
      "taxId": "12345678900"
    },
    "returnUrl": "https://meusite.com/obrigado",
    "completionUrl": "https://meusite.com/sucesso"
  }' \
  https://api.abacatepay.com/v2/checkouts/create | jq
```

---

### Transparent Checkout (Pix QR Code direto)

**Create transparent transaction**
```bash
curl -s -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000}' \
  https://api.abacatepay.com/v2/transparents/create | jq
```

**Check transaction status**
```bash
curl -s -H "Authorization: Bearer $KEY" \
  https://api.abacatepay.com/v2/transparents/TRANSACTION_ID | jq
```

**Simulate payment (Dev mode only)**
```bash
curl -s -X POST -H "Authorization: Bearer $KEY" \
  "https://api.abacatepay.com/v2/transparents/simulate-payment?id=TRANSACTION_ID" | jq
```

### Pagar um PIX copia-e-cola (DevMode — passo a passo)

Quando o usuário fornece um **BR Code** (copia-e-cola) do AbacatePay DevMode, o fluxo para simular o pagamento é:

**1. Extrair o transaction ID do BR Code**

O BR Code contém a chave PIX do devmode: `devmode-pix-pix_char_<ID>`. O `<ID>` é o `transaction_id`. Exemplo:
```
00020101021126580014BR.GOV.BCB.PIX0136devmode-pix-pix_char_kZzwfuQcymJxT0rnqDgjugpT...
                                   └──── transaction_id: pix_char_kZzwfuQcymJxT0rnqDgjugpT
```

**2. Localizar o pedido no banco (quando aplicável)**

Se o projeto tiver banco local (Supabase), busque o pedido pelo `qr_code`:
```bash
psql "$DB_URL" -c "
SELECT id, payment_id, status, payment_gateway
FROM orders
WHERE qr_code LIKE '%<parte-do-id>%';
"
```
Isso confirma o `payment_id` e o status atual (`aguardando_pagamento`).

**3. Simular o pagamento**
```bash
export ABACATEPAY_API_KEY="<sua-chave-dev>"
curl -s -X POST -H "Authorization: Bearer $ABACATEPAY_API_KEY" \
  "https://api.abacatepay.com/v2/transparents/simulate-payment?id=pix_char_<ID>" | jq
```

Resposta esperada (sucesso):
```json
{
  "success": true,
  "data": {
    "id": "pix_char_<ID>",
    "amount": 15162,
    "status": "PAID",
    "devMode": true,
    "brCode": "...",
    "platformFee": 80,
    "metadata": { "orderId": "<uuid>", "userId": "<uuid>" }
  },
  "error": null
}
```

> ⚠️ Esse endpoint só funciona em **DevMode**. Em produção, o pagamento deve ser feito pelo usuário através do app do banco usando o BR Code / QR Code.
>
> 🔁 Após simular, se o webhook da AbacatePay estiver configurado, o pedido será atualizado automaticamente para `em_preparo`.

---

### Subscriptions

**List subscriptions**
```bash
curl -s -H "Authorization: Bearer $KEY" \
  https://api.abacatepay.com/v2/subscriptions/list | jq
```

**Create a subscription product**
```bash
curl -s -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "sub-001",
    "name": "Plano Mensal",
    "price": 2990,
    "frequency": {"cycle": "MONTHLY"},
    "currency": "BRL"
  }' \
  https://api.abacatepay.com/v2/subscriptions/create | jq
```

---

### Coupons

**List coupons**
```bash
curl -s -H "Authorization: Bearer $KEY" \
  https://api.abacatepay.com/v2/coupons/list | jq
```

**Create a coupon**
```bash
curl -s -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "DESCONTO20",
    "discountKind": "PERCENTAGE",
    "discount": 20,
    "maxRedeems": -1
  }' \
  https://api.abacatepay.com/v2/coupons/create | jq
```

**Toggle coupon (enable/disable)**
```bash
curl -s -X PATCH -H "Authorization: Bearer $KEY" \
  https://api.abacatepay.com/v2/coupons/COUPON_ID/toggle | jq
```

**Delete a coupon**
```bash
curl -s -X DELETE -H "Authorization: Bearer $KEY" \
  https://api.abacatepay.com/v2/coupons/COUPON_ID | jq
```

---

### Payouts (Saques)

**List payouts**
```bash
curl -s -H "Authorization: Bearer $KEY" \
  https://api.abacatepay.com/v2/payouts/list | jq
```

**Create a payout**
```bash
curl -s -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000}' \
  https://api.abacatepay.com/v2/payouts/create | jq
```

**Get payout by ID**
```bash
curl -s -H "Authorization: Bearer $KEY" \
  https://api.abacatepay.com/v2/payouts/PAYOUT_ID | jq
```

---

### MRR & Revenue

**Get MRR**
```bash
curl -s -H "Authorization: Bearer $KEY" \
  https://api.abacatepay.com/v2/mrr | jq
```

**Get revenue**
```bash
curl -s -H "Authorization: Bearer $KEY" \
  https://api.abacatepay.com/v2/revenue | jq
```

**Get merchant info**
```bash
curl -s -H "Authorization: Bearer $KEY" \
  https://api.abacatepay.com/v2/merchant-info | jq
```

---

## Guidelines

1. Always format monetary outputs: divide by 100 and show as `R$ X,XX`
2. Present lists in a readable table format when possible
3. Ask for confirmation before creating, deleting, or modifying resources
4. On errors, show the error message and suggest fixes
5. Use `jq` to parse and format JSON responses
