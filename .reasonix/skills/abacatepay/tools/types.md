# API Types

## What is @abacatepay/types?

The [@abacatepay/types](https://www.npmjs.com/package/@abacatepay/types) provides **official typings and modern helpers** for working with the AbacatePay API in a safe, predictable, and aligned way with the official documentation.

The package is **TypeScript-first** and serves as the foundation for direct integrations via `fetch`, internal SDKs, CLIs, and validations in backend applications.

> The package **does not add types beyond what exists in the official documentation**.
> Each type faithfully reflects the AbacatePay public API.

### When to use API Types?
- You want **strong typing** without abstractions
- You use `fetch` or your own HTTP clients
- You need **stable contracts** between API versions
- You want to type webhooks, routes, and payloads accurately

## Installation

Use your preferred package manager:

```bash
bun add @abacatepay/types
# or
pnpm add @abacatepay/types
# or
npm install @abacatepay/types
```

## Type Versioning

Before anything, you must specify the API version you want to use, adding /v* in the import:

```ts
import { APICustomer } from '@abacatepay/types/v2';
```

**Global Types**

Global types and constants are not versioned and should be imported directly:

```ts
import { version, API_BASE_URL, API_VERSION } from '@abacatepay/types';
```

## Available Types

### Customers

```ts
import { APICustomer, APICustomerCreate, APICustomerList } from '@abacatepay/types/v2';

const customer: APICustomer = {
  id: 'cus_123',
  name: 'John Doe',
  email: 'john@example.com',
  taxId: '12345678900',
  cellphone: '+5511999999999',
  zipCode: '01310-100',
  createdAt: '2023-01-01T00:00:00Z',
  updatedAt: '2023-01-01T00:00:00Z'
};
```

### Checkouts

```ts
import { APICheckout, APICheckoutCreate } from '@abacatepay/types/v2';

const checkout: APICheckoutCreate = {
  items: [{ id: 'prod_123', quantity: 1 }],
  customer: {
    name: 'John Doe',
    email: 'john@example.com'
  },
  returnUrl: 'https://example.com/success',
  completionUrl: 'https://example.com/complete'
};
```

### Webhooks

```ts
import { APIWebhookEvent, APIWebhookEventType } from '@abacatepay/types/v2';

const event: APIWebhookEvent = {
  id: 'evt_123',
  type: APIWebhookEventType.CheckoutPaid,
  data: {
    // Event-specific data
  },
  createdAt: '2023-01-01T00:00:00Z'
};
```

## Integration with Zod

For runtime validation, combine with [Zod](../zod):

```ts
import { APICustomerCreate } from '@abacatepay/types/v2';
import { z } from 'zod';

const customerSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  taxId: z.string().optional(),
  cellphone: z.string().optional()
}) satisfies z.ZodType<APICustomerCreate>;

const data = customerSchema.parse(req.body);
```

## Go Types

For Go, check the official types package: [@abacatepay/types-go](../types-go).

## Related Resources

- [Zod Integration](../zod) — Runtime validation with Zod.
- [TypeBox](../typebox) — JSON Schema generation with TypeBox.
- [REST Client](../rest) — Typed HTTP client for integrations.

## Official Documentation

For full API types reference and versioning details, see [AbacatePay Types Docs](https://docs.abacatepay.com/ecosystem/types).</content>
<parameter name="filePath">/home/albqvxc/www/abacatepay/skills/tools/types.md