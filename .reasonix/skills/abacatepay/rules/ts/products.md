# Product Management

Products represent items in your catalog that can be used in checkouts or subscriptions. Use the AbacatePay API to manage them via CRUD operations.

## Key Concepts

- **External ID**: A unique identifier from your system (e.g., SKU) to track products.
- **Caching**: Implement caching for list operations to reduce API calls and improve performance.
- **Integration**: Products are referenced in checkouts and subscriptions by their ID.

## Operations

### Create a Product

Use `abacate.products.create()` with required fields: `externalId`, `name`, `price`, `currency`.

```typescript
import AbacatePay from '@abacatepay/sdk';

const abacate = AbacatePay(process.env.ABACATEPAY_API_KEY);

export async function createProduct() {
  const product = await abacate.products.create({
    externalId: "prod-123",
    name: "Abacatinho",
    price: 2500, // in cents
    currency: "BRL"
  });

  console.log(product);
  return product;
}
```

### List Products

Fetch paginated lists; cache results for efficiency.

```typescript
// Simple in-memory cache (use Redis in production)
const cache = new Map<string, any>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function listProducts() {
  const cacheKey = 'products_list';
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('Returning cached products');
    return cached.data;
  }

  const products = await abacate.products.list();
  cache.set(cacheKey, { data: products, timestamp: Date.now() });

  console.log(products);
  return products;
}
```

### Get a Product

Retrieve a specific product by ID.

```typescript
export async function getProduct(id: string) {
  const product = await abacate.products.get({ id });
  console.log(product);
  return product;
}
```

### Delete a Product

Remove a product (ensure it's not referenced in active checkouts/subscriptions).

```typescript
export async function deleteProduct(id: string) {
  const result = await abacate.products.delete({ id });
  console.log(result);
  return result;
}
```

## Best Practices

- **Validation**: Check for required fields and handle errors (e.g., duplicate externalId).
- **Caching**: Use TTL-based caching for lists to avoid rate limits.
- **Security**: Store API keys securely; validate responses.
- **Integration**: Link products to checkouts via metadata or externalId.

See full examples in `examples/ts/products.ts`.</content>
<parameter name="filePath">/home/albqvxc/www/abacatepay/skills/rules/ts/products.md