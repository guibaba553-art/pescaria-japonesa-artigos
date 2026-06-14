import { AbacatePay } from '@abacatepay/sdk';

// Define types for payout operations
export type PayoutRequest = {
  amount: number; // in cents
  externalId: string;
  description?: string;
};

export type Payout = {
  id: string;
  status: string;
  devMode: boolean;
  receiptUrl: string | null;
  amount: number;
  platformFree: number;
  externalId: string;
  createdAt: string;
  updatedAt?: string;
};

const abacate = AbacatePay({ secret: process.env.ABACATEPAY_API_KEY });

/**
 * Creates a new payout request for fund withdrawal.
 * Payouts transfer money from your account to external destinations.
 * @returns Promise<Payout> - Created payout object
 */
export async function createPayout(): Promise<Payout> {
  try {
    // Create payout with amount in cents and tracking ID
    const payout = await abacate.payouts.create({
      amount: 10000, // Amount in cents (R$ 100.00)
      externalId: "saque-123" // Unique identifier for tracking
    });

    console.log("Payout created:", payout.id);
    return payout;
  } catch (error) {
    console.error("Error creating payout:", error);
    throw error;
  }
}

/**
 * Lists payouts with pagination.
 * Useful for financial reporting and payout tracking.
 * @param page - Page number for pagination (default: 1)
 * @param limit - Items per page (default: 20)
 * @returns Promise<Payout[]> - Array of payouts
 */
export async function listPayouts(page: number = 1, limit: number = 20): Promise<Payout[]> {
  try {
    // Retrieve paginated list of payouts
    const payouts = await abacate.payouts.list({
      page,
      limit
    });

    console.log("Payouts retrieved:", payouts.length, "items");
    return payouts;
  } catch (error) {
    console.error("Error listing payouts:", error);
    throw error;
  }
}

/**
 * Retrieves a specific payout by ID.
 * Useful for checking payout status and details.
 * @param id - Payout ID to retrieve
 * @returns Promise<Payout> - Payout details
 */
export async function getPayout(id: string): Promise<Payout> {
  try {
    // Get specific payout information
    const payout = await abacate.payouts.get({ id });

    console.log("Payout retrieved:", payout.id);
    return payout;
  } catch (error) {
    console.error("Error getting payout:", error);
    throw error;
  }
}


