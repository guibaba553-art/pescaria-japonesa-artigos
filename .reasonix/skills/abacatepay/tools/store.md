# Store Information

Manage your store and view account details.

## Overview

The **Store** represents your account in AbacatePay, containing all essential information about your business and available balances.

## Structure

A store is represented in our API by the following structure:

```json
{
  "id": "store_123456",
  "name": "My Online Store",
  "balance": {
    "available": 15000,
    "pending": 5000,
    "blocked": 2000
  }
}
```

## Attributes

- **id**: string. Unique identifier of your store in AbacatePay
- **name**: string. Name of your store/company
- **balance**: object. Object containing information about your account balances
  - **available**: number. Available balance for withdrawal in cents
  - **pending**: number. Pending confirmation balance in cents
  - **blocked**: number. Balance blocked in disputes in cents

### Values in Cents
All balance values are returned in cents. To convert to reais, divide by 100. For example: 15000 cents = R$ 150.00

### Blocked Balance
The blocked balance represents values that are in dispute or under analysis. These values are not available for withdrawal until the situation is resolved.

## Retrieving Store Information

```typescript
const store = await abacate.store.get();
console.log(`Available balance: R$ ${store.balance.available / 100}`);
```

```go
store, err := client.Store.Get(context.Background())
if err != nil {
    panic(err)
}
fmt.Printf("Available balance: R$ %.2f\n", float64(store.Balance.Available)/100)
```

## Monitoring Balances

- Check available balance before initiating payouts
- Monitor pending balances for expected settlements
- Be aware of blocked amounts that may affect operations

## Related Resources

- [Payouts](../payouts) — Withdrawing available balance
- [Dashboard](https://dashboard.abacatepay.com) — Visual balance monitoring

## Official Documentation

For complete store API reference, see [AbacatePay Store Docs](https://docs.abacatepay.com/store).