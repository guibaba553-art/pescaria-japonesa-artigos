# Referência de API - AbacatePay

Esta é uma referência condensada da API baseada no OpenAPI do mock-dock. Ela cobre os principais endpoints para clientes, cupons, produtos, checkouts, transparents e payouts. Todas as requisições usam Bearer token no header `Authorization` e retornam `{data, error}`.

# API Reference - AbacatePay

This is a condensed API reference based on the OpenAPI from mock-dock. It covers the main endpoints for customers, coupons, products, checkouts, transparents, and payouts. All requests use Bearer token in the `Authorization` header and return `{data, error}`.

## Customers

### POST /customers/create
- **Description**: Create new customer. Only `email` is required.
- **Body**:
  ```json
  {
    "email": "albuquerquesz@abacatepay.com",  // Required: valid email
    "name": "Victor Albuquerque",             // Optional: full name
    "cellphone": "(11) 4002-8922",            // Optional: phone number
    "taxId": "123.456.789-01",                // Optional: CPF or CNPJ
    "zipCode": "01310-100",                   // Optional: postal code
    "metadata": {"source": "landing-page"}    // Optional: metadata
  }
  ```
- **Response 200**:
  ```json
  {
    "data": {"id": "cust_...", "email": "..."},
    "error": null
  }
  ```

### GET /customers/list
- **Query Params**: `page` (default 1), `limit` (default 20, max 100).
- **Response 200**: Paginated list.

### GET /customers/get
- **Query Params**: `id` (required).

### DELETE /customers/delete
- **Body**:
  ```json
  {"id": "cust_..."}
  ```

## Coupons

### POST /coupons/create
- **Description**: Create coupon (required fields: `code`, `discountType`, `value`).
- **Body**:
  ```json
  {
    "code": "ABKT10",                        // Required: unique code
    "discountType": "percentage",             // Required: "PERCENTAGE" or "FIXED"
    "value": 10,                              // Required: discount value
    "maxRedemptions": 100,                    // Optional: max redemptions (-1 unlimited)
    "expiresAt": "2025-12-31"                 // Optional: expiration date
  }
  ```

### GET /coupons/list
- **Query Params**: `page`, `limit`.

### GET /coupons/get
- **Query Params**: `id`.

### DELETE /coupons/delete
- **Body**:
  ```json
  {"id": "MY_COUPON"}
  ```

### PATCH /coupons/toggle
- **Body**:
  ```json
  {"id": "MY_COUPON"}
  ```

## Products

### POST /products/create
- **Body**:
  ```json
  {
    "externalId": "prod-123",          // Required: unique ID in your system
    "name": "Product Example",         // Required: product name
    "price": 10000,                   // Required: price in cents
    "currency": "BRL",                // Required: currency (default "BRL")
    "description": "Description"        // Optional: description
  }
  ```

### GET /products/list
- **Query Params**: `page`, `limit`.

### GET /products/get
- **Query Params**: `id` or `externalId`.

### DELETE /products/delete
- **Body**:
  ```json
  {"id": "prod_..."}
  ```

## Checkouts

### POST /checkouts/create
- **Description**: Create integrated checkout, returns URL.
- **Body**:
  ```json
  {
    "items": [                                // Required: list of items
      {"id": "prod-1234", "quantity": 2}
    ],
    "method": "PIX",                          // Optional: payment method ("PIX" or "CARD")
    "returnUrl": "https://site.com/back",     // Optional: return URL
    "completionUrl": "https://site.com/success", // Optional: completion URL
    "customerId": "cust_...",                 // Optional: existing customer ID
    "customer": {                             // Optional: customer data (all fields required if used)
      "name": "Victor Albuquerque",           // Required if customer used
      "cellphone": "11 4002-8922",            // Required if customer used
      "email": "albuquerquesz@abacatepay.com", // Required if customer used
      "taxId": "123.456.789-01"               // Required if customer used
    },
    "coupons": ["ABKT10"],                    // Optional: list of coupons
    "externalId": "your_id_123",              // Optional: external ID
    "metadata": {"source": "campaign"}        // Optional: metadata
  }
  ```

### GET /checkouts/get
- **Query Params**: `id` (required).

### GET /checkouts/list
- No specific parameters.

## Transparents (PIX QRCode)

### POST /transparents/create
- **Body**:
  ```json
  {
    "amount": 10000,                          // Required: amount in cents
    "expiresIn": 3600,                        // Optional: expiration in seconds
    "description": "Payment",               // Optional: payment description
    "customer": {                             // Optional: customer data (all fields required if used)
      "name": "Victor Albuquerque",            // Required if customer used
      "cellphone": "(11) 4002-8922",           // Required if customer used
      "email": "albuquerquesz@abacatepay.com",  // Required if customer used
      "taxId": "123.456.789-01"                // Required if customer used
    },
    "metadata": {}                            // Optional: metadata
  }
  ```
- **Response 200**:
  ```json
  {
    "data": {
      "amount": 10000,
      "status": "PENDING",
      "brCode": "000201...",
      "brCodeBase64": "data:image/png;base64,...",
      "expiresAt": "2025-03-25T21:50:20.772Z"
    },
    "error": null
  }
  ```

### GET /transparents/check
- **Query Params**: `id` (required).
- **Response 200**: Status (PENDING, PAID, etc.) and `expiresAt`.

### POST /transparents/simulate-payment
- **Query Params**: `id`.
- **Body**: Optional `metadata`.
- Dev mode only.

## Payouts

### POST /payouts/create
- **Body**:
  ```json
  {
    "amount": 10000,
    "externalId": "withdrawal-123",
    "description": "Withdrawal"
  }
  ```
- **Response 200**:
  ```json
  {
    "data": {
      "id": "txn_...",
      "status": "PENDING",
      "amount": 10000,
      "platformFee": 100,
      "externalId": "withdrawal-123"
    },
    "error": null
  }
  ```

### GET /payouts/get
- **Query Params**: `externalId` (required).

## Common Schemas

- **Customer**: `id`, `email`, `name`, `cellphone`, `taxId`, `zipCode`, `metadata`, `createdAt`, `updatedAt`.
- **Coupon**: `id`, `code`, `discountType`, `value`, `maxRedemptions`, `expiresAt`, `active`, etc.
- **Product**: `id`, `externalId`, `name`, `price`, `currency`, `description`.
- **Billing**: `id`, `status`, `amount`, `items`, `customer`, `coupons`, `externalId`, `metadata`, `url`, `createdAt`.
- **PixQRCode**: `id`, `amount`, `status`, `brCode`, `brCodeBase64`, `expiresAt`.

For complete details, see the OpenAPI at `mock-dock/openapi.yaml`. All endpoints return errors on failure (401, 404, etc.).
