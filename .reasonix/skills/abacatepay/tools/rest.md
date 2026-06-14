# REST Client

## What is @abacatepay/rest?

The [@abacatepay/rest](https://www.npmjs.com/package/@abacatepay/rest) is a **lightweight, fast, and fully typed REST client** for consuming the AbacatePay API directly, without heavy abstractions.

It is designed for **Node.js, Bun, and modern runtimes**, offering full control over requests, with **smart retries**, **automatic backoff**, **configurable timeouts**, and **consistent error handling**.

### When to use the REST Client?
- You want **full control** over endpoints and payloads
- You are creating **SDKs, CLIs, or internal tools**
- You prefer a thin layer over HTTP instead of high-level abstractions
- You need **performance and predictability**

## Installation

Use your preferred package manager:

```bash
bun add @abacatepay/rest
# or
pnpm add @abacatepay/rest
# or
npm install @abacatepay/rest
```

## Basic Usage

Example simulating a Pix payment via QR Code:

```ts
import { REST } from '@abacatepay/rest';

const client = new REST({
    secret: process.env.ABACATEPAY_API_KEY!,
});

const pix = await client.post('/transparents/simulate-payment', {
    query: {
        id: 'pix_char_123456'
    },
});
```

## Advanced Configuration

```ts
const client = new REST({
    secret: 'your-api-key',
    baseURL: 'https://api.abacatepay.com/v2',
    timeout: 10000, // 10 seconds
    retries: 3,
    backoff: 'exponential',
});
```

## Methods

The client provides typed methods for all HTTP verbs:

- `client.get(path, options)` - GET requests
- `client.post(path, body, options)` - POST requests
- `client.put(path, body, options)` - PUT requests
- `client.patch(path, body, options)` - PATCH requests
- `client.delete(path, options)` - DELETE requests

## Error Handling

The client throws typed errors:

```ts
try {
    const response = await client.get('/customers');
    console.log(response.data);
} catch (error) {
    if (error.status === 401) {
        console.error('Unauthorized');
    } else if (error.status >= 500) {
        console.error('Server error');
    }
}
```

## Integration with Types

Combine with [@abacatepay/types](../types) for full type safety:

```ts
import { REST } from '@abacatepay/rest';
import { APICustomer } from '@abacatepay/types/v2';

const client = new REST({ secret: process.env.ABACATEPAY_API_KEY! });

const customers = await client.get('/customers/list') as { data: APICustomer[] };
```

## Related Resources

- [API Types](../types) — Official typings for the API.
- [Zod Integration](../zod) — Runtime validation.
- [CLI](../cli) — Command-line tool using this client.

## Official Documentation

For advanced configuration and error handling, see [AbacatePay REST Docs](https://docs.abacatepay.com/ecosystem/rest).</content>
<parameter name="filePath">/home/albqvxc/www/abacatepay/skills/tools/rest.md