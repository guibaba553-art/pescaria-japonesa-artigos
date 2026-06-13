import { AbacatePay } from '@abacatepay/sdk';

// Define types for better type safety and LLM context
export type CheckoutItem = {
  id: string;
  quantity: number;
};

export type CheckoutCustomer = {
  name: string;
  email: string;
  cellphone: string;
  taxId: string;
};

export type Checkout = {
  id: string;
  externalId: string | null;
  amount: number;
  paidAmount: number | null;
  items: CheckoutItem[];
  devMode: boolean;
  customerId: string | null;
  returnUrl: string | null;
  completionUrl: string | null;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  url: string;
  expiresAt: string;
};

const abacate = AbacatePay({ secret: process.env.ABACATEPAY_API_KEY });

/**
 * Creates a new checkout with items and customer details.
 * Handles validation, error scenarios, and logging.
 * @param items - Array of checkout items
 * @param customer - Customer data
 * @returns Promise<Checkout> - Created checkout object
 */
export async function createCheckout(items: CheckoutItem[] = [{ id: "prod_456", quantity: 2 }], customer: CheckoutCustomer = {
  name: "Victor Albuquerque",
  email: "contact@albuquerquesz.com.br",
  cellphone: "+5511999999999",
  taxId: "12345678900"
}): Promise<Checkout> {
  try {
    // Create checkout via API with additional metadata
    const checkout = await abacate.checkouts.create({
      items,
      customer,
      externalId: "pedido-123", // For tracking in your system
      returnUrl: "https://links.albuquerquesz.com.br", // Where user returns after payment
      completionUrl: "https://me.albuquerquesz.com.br", // Where user goes after completion
    });

    console.log("Checkout created:", checkout.url);
    return checkout;
  } catch (error: any) {
    console.error("Error creating checkout:", error.message);
    // Handle specific error types
    if (error.message.includes('rate limit')) {
      console.log("Rate limited, implement exponential backoff here");
      // Add retry logic with backoff
    }

    if (error.message.includes('decline')) {
      console.log("Payment declined, notify user to try different method");
      // Handle decline scenarios
    }
    throw error;
  }
}

/**
 * Lists existing checkouts with pagination support.
 * Useful for admin dashboards or transaction history.
 * @returns Promise<any> - List of checkouts
 */
export async function listCheckouts(): Promise<any> {
  try {
    // Fetch paginated list of checkouts
    const checkouts = await abacate.checkouts.list();

    console.log("Checkouts retrieved:", checkouts.length, "items");
    return checkouts;
  } catch (error) {
    console.error("Error listing checkouts:", error);
    throw error;
  }
}

/**
 * Retrieves a specific checkout by ID.
 * Useful for status checking or order details.
 * @param id - Checkout ID to retrieve
 * @returns Promise<Checkout> - Checkout details
 */
export async function getCheckout(id: string): Promise<Checkout> {
  try {
    // Get specific checkout details
    const checkout = await abacate.checkouts.get({ id });

    console.log("Checkout retrieved:", checkout.url);
    return checkout;
  } catch (error) {
    console.error("Error getting checkout:", error);
    throw error;
  }
}
