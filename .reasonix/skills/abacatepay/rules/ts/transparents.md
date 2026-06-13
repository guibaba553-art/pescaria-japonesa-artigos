# Transparent Checkout

Process payments without redirecting the user away from your application.

## Operations
- **Create**: Initiate a transparent transaction.
- **Simulate**: Test payment flows (Dev mode).
- **Check**: Verify transaction status.

## TS Example
(Source: `examples/ts/transparents.ts`)

```typescript
export async function createTransparent() {
  try {
    const customer = await abacate.transparents.create(
      {
        amount: 10000,
      },
    );

    console.log("Customer created:", customer.id);
    return customer;
  } catch (error) {
    console.error("Error creating customer:", error);
    throw error;
  }
}

export async function simulateTransparent(id: string) {
  try {
    const simulated = await abacate.transparents.simulate({ id });

    console.log("Payment simulated:", simulated.id);
    return simulated;
  } catch (error) {
    console.error("Error creating customer:", error);
    throw error;
  }
}

export async function checkTransparent(id: string) {
  try {
    const simulated = await abacate.transparents.check({ id });

    console.log("Payment simulated:", simulated.id);
    return simulated;
  } catch (error) {
    console.error("Error creating customer:", error);
    throw error;
  }
}
```