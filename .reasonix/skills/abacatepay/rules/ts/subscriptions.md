# Subscriptions & Products

Handle recurring billing by creating products with defined frequencies (e.g., Monthly).

## Operations
- **Create Product**: Define the recurring plan details.
- **List Products**: View available plans.

## TS Example
(Source: `examples/ts/subscriptions.ts`)

// See examples/ts/subscriptions.ts
export async function createSubscription() {
  try {
    const subscription = await abacate.subscription.create({
      externalId: "prod-123",
      name: "Produto Exemplo",
      price: 10000,
      frequency: {
        cycle: "MONTHLY",
      },
      currency: "BRL",
      description: "Descrição do produto",
      image: "https://example.com/image.jpg"
    });

    console.log("Subscription product created:", subscription.id);
    return subscription;
  } catch (error) {
    console.error("Error creating subscription product:", error);
    throw error;
  }
}

export async function listSubscriptions() {
  try {
    const subscriptions = await abacate.subscription.list();

    console.log("Subscriptions retrieved");
    return subscriptions;
  } catch (error) {
    console.error("Error listing subscriptions:", error);
    throw error;
  }
}