# Zod Schemas

## What is @abacatepay/zod?

The [@abacatepay/zod](https://www.npmjs.com/package/@abacatepay/zod) exposes **all public schemas of the AbacatePay API** using **Zod**, serving as the **single source of truth** for data contracts, runtime validation, and OpenAPI generation via `.meta()`.

There are no extra abstractions or "invented types": the schemas reflect **exactly** the documented API.

Designed for **TypeScript-first**, with direct integration in modern frameworks like **Elysia**, **Fastify**, **Hono**, plus full compatibility with **Node.js** and **Bun**.

### When to use Zod?
- You want **typed contracts + runtime validation**
- You need to ensure **compatibility between API versions**
- You want to generate **OpenAPI 3.1** automatically
- You are building typed SDKs, gateways, or backends

## Installation

Use your preferred package manager:

```bash
bun add @abacatepay/zod
# or
pnpm add @abacatepay/zod
# or
npm install @abacatepay/zod
```

## Structure and Versioning

Like other AbacatePay packages, schemas are versioned by API.

Always import the version corresponding to the API you are using:

```ts
import { APICustomer } from '@abacatepay/zod/v1';
import { APISubscription } from '@abacatepay/zod/v2';
```

Global schemas (e.g., version, utilities, and helpers) are exported without versioning:

```ts
import { version } from '@abacatepay/zod';
```

## Usage Examples

### Validating Customer Data

```ts
import { APICustomerCreate } from '@abacatepay/zod/v2';

const customerData = {
  name: 'John Doe',
  email: 'john@example.com',
  taxId: '12345678900'
};

const result = APICustomerCreate.safeParse(customerData);
if (result.success) {
  console.log('Valid customer:', result.data);
} else {
  console.error('Validation errors:', result.error.issues);
}
```

### Webhook Payload Validation

```ts
import { APIWebhookEvent } from '@abacatepay/zod/v2';

app.post('/webhooks', (req, res) => {
  const result = APIWebhookEvent.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }

  // Process valid event
  console.log('Event type:', result.data.type);
  res.sendStatus(200);
});
```

### OpenAPI Generation

```ts
import { APICustomerCreate } from '@abacatepay/zod/v2';

const schema = APICustomerCreate.meta();
console.log(JSON.stringify(schema, null, 2));
// Outputs OpenAPI 3.1 compatible JSON schema
```

## Framework Integration

### Elysia (Bun)

```ts
import { Elysia } from 'elysia';
import { APICustomerCreate } from '@abacatepay/zod/v2';

const app = new Elysia()
  .post('/customers', ({ body }) => {
    // body is automatically validated
    return { success: true };
  }, {
    body: APICustomerCreate
  });
```

### Fastify

```ts
import Fastify from 'fastify';
import { APICustomerCreate } from '@abacatepay/zod/v2';

const fastify = Fastify();

fastify.post('/customers', {
  schema: {
    body: APICustomerCreate
  }
}, async (request) => {
  // request.body is validated
  return { created: true };
});
```

## Related Resources

- [API Types](../types) — TypeScript typings without Zod.
- [REST Client](../rest) — HTTP client for requests.
- [TypeBox](../typebox) — Alternative JSON Schema generation.

## Official Documentation

For schema versioning and OpenAPI generation, see [AbacatePay Zod Docs](https://docs.abacatepay.com/ecosystem/zod).</content>
<parameter name="filePath">/home/albqvxc/www/abacatepay/skills/tools/zod.md