import { AbacatePay } from '@abacatepay/sdk';

// Define types for subscription operations
export type SubscriptionFrequency = {
  cycle: string; // e.g., "MONTHLY", "YEARLY"
};

export type SubscriptionProduct = {
  externalId: string;
  name: string;
  price: number; // in cents
  frequency: SubscriptionFrequency;
  currency: string;
  description?: string;
  image?: string;
};

export type Subscription = {
  id: string;
  externalId: string;
  name: string;
  price: number;
  frequency: SubscriptionFrequency;
  currency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

const abacate = AbacatePay({ secret: process.env.ABACATEPAY_API_KEY });

/**
 * Creates a new subscription product.
 * Subscription products define recurring billing items.
 * @returns Promise<Subscription> - Created subscription product
 */
export async function createSubscription(): Promise<Subscription> {
  try {
    // Create subscription product with billing details
    const subscription = await abacate.subscriptions.create({
      externalId: "prod-123", // Unique ID for your system
      name: "Produto Exemplo",
      price: 10000, // Price in cents (R$ 100.00)
      frequency: {
        cycle: "MONTHLY", // Billing cycle
      },
      currency: "BRL",
      description: "Descrição do produto", // Optional description
      image: "https://example.com/image.jpg" // Optional product image
    });

    console.log("Subscription product created:", subscription.id);
    return subscription;
  } catch (error) {
    console.error("Error creating subscription product:", error);
    throw error;
  }
}

/**
 * Lists all subscription products.
 * Useful for catalog management and billing setup.
 * @returns Promise<Subscription[]> - Array of subscription products
 */
export async function listSubscriptions(): Promise<Subscription[]> {
  try {
    // Retrieve all subscription products
    const subscriptions = await abacate.subscriptions.list();

    console.log("Subscriptions retrieved:", subscriptions.length, "items");
    return subscriptions;
  } catch (error) {
    console.error("Error listing subscriptions:", error);
    throw error;
  }
}
