# Node.js SDK

Official AbacatePay SDK for Node.js - Accept payments in seconds with a simple integration.

## Installation

```bash
npm install @abacatepay/sdk
```

## Quick Usage

```ts
import { AbacatePay } from "@abacatepay/sdk";

// Initialize the SDK with your API key
const abacate = AbacatePay({ secret: "API_KEY" });
```

## Creating a Payment

```ts
// Create a new checkout
const checkout = await abacate.checkouts.create({
    items: [
        {
            id: "item_abc123",
            quantity: 2,
        },
    ],
    customerId: "cust_987"
});
```

## Response

```ts
{
    id: "bill_123456789",
    amount: 15000,
    currency: "BRL",
    status: "pending",
    checkoutUrl: "https://pay.abacatepay.com/bill_123456789",
    expiresAt: "2023-12-31T23:59:59Z"
}
```

## Managing Customers

```ts
// Create a customer
const customer = await abacate.customers.create({
    name: "John Doe",
    email: "john@example.com",
    taxId: "12345678900"
});

// List customers
const customers = await abacate.customers.list();
```

## Webhooks

```ts
import { AbacatePay } from "@abacatepay/sdk";

const abacate = AbacatePay({ secret: "API_KEY" });

// Verify webhook signature
const event = abacate.webhooks.verify(rawBody, signature);

if (event.type === "checkout.paid") {
    console.log("Payment received:", event.data.id);
}
```

## Error Handling

```ts
try {
    const checkout = await abacate.checkouts.create({ /* ... */ });
} catch (error) {
    if (error.code === "invalid_api_key") {
        console.error("Invalid API key");
    } else if (error.code === "insufficient_funds") {
        console.error("Payment failed due to insufficient funds");
    }
}
```

## Documentation

For full API reference, see [AbacatePay Node.js SDK Docs](https://docs.abacatepay.com/sdks/nodejs).