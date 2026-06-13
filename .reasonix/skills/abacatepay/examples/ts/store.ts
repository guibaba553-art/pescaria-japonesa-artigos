import { AbacatePay } from '@abacatepay/sdk';

// Define types for store operations
export type StoreBalance = {
  available: number; // in cents
  pending: number; // in cents
  blocked: number; // in cents
};

export type Store = {
  id: string;
  name: string;
  balance: StoreBalance;
};

const abacate = AbacatePay({ secret: process.env.ABACATEPAY_API_KEY });

/**
 * Retrieves store information including balance details.
 * Useful for financial monitoring and account management.
 * @returns Promise<Store> - Store details with balance info
 */
export async function getStore(): Promise<Store> {
  try {
    // Get current store information and balance
    const store = await abacate.store.get();

    console.log("Store retrieved:", store.name);
    console.log("Available balance:", store.balance.available / 100, "BRL");
    return store;
  } catch (error) {
    console.error("Error getting store:", error);
    throw error;
  }
}


