# Subscription Items

Manage individual items within recurring subscriptions.

## Overview

Subscription items represent the individual products or services included in a subscription plan. They define what is being charged periodically.

## Structure

A subscription item has the following structure:

```typescript
interface SubscriptionItem {
  id: string;           // Item ID
  productId: string;    // Reference to the product
  quantity: number;     // Quantity of this item
  price: number;        // Unit price in cents
  metadata?: object;    // Additional data
}
```

## Managing Items

### Adding Items to Subscriptions

When creating a subscription, include items:

```typescript
const subscription = await abacate.subscriptions.create({
  customerId: "cust_123",
  items: [
    {
      productId: "prod_456",
      quantity: 1
    }
  ],
  frequency: { cycle: "MONTHLY" }
});
```

### Updating Items

Modify items in an existing subscription:

```typescript
await abacate.subscriptions.update(subscriptionId, {
  items: [
    {
      productId: "prod_456",
      quantity: 2  // Increased quantity
    },
    {
      productId: "prod_789",
      quantity: 1  // New item
    }
  ]
});
```

## Best Practices

- Keep item IDs consistent with your product catalog
- Use metadata for custom pricing or discounts
- Validate quantities before creating subscriptions
- Monitor item changes for billing accuracy

## Related Resources

- [Subscriptions](../subscriptions) — Main subscription management
- [Products](../products) — Product catalog management

## Official Documentation

For detailed subscription items API, see [AbacatePay Items Docs](https://docs.abacatepay.com/items).