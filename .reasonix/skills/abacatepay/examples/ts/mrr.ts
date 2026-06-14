import { AbacatePay } from '@abacatepay/sdk';

// Define types for MRR operations
export type MrrData = {
  mrr: number;
  totalActiveSubscriptions: number;
};

export type MerchantInfo = {
  name: string;
  website: string;
  createdAt: string;
};

export type Transaction = {
  amount: number;
  count: number;
};

export type RevenueData = {
  totalRevenue: number;
  totalTransactions: number;
  transactionsPerDay: Record<string, Transaction>;
  revenue: number;
  currency: string;
};

const abacate = AbacatePay({ secret: process.env.ABACATEPAY_API_KEY });

/**
 * Retrieves Monthly Recurring Revenue (MRR) data.
 * Shows recurring revenue metrics for business insights.
 * @returns Promise<MRRData[]> - Array of MRR data points
 */
export async function getMRR(): Promise<MRRData[]> {
  try {
    // Fetch MRR metrics using SDK
    const data = await abacate.mrr.get();

    console.log("MRR Data retrieved:", data.length, "entries");
    return data;
  } catch (error) {
    console.error('Error fetching MRR:', error);
    throw error;
  }
}

/**
 * Retrieves merchant account information.
 * Useful for account verification and profile data.
 * @returns Promise<MerchantInfo> - Merchant account details
 */
export async function getMerchantInfo(): Promise<MerchantInfo> {
  try {
    // Fetch merchant account information using SDK
    const data = await abacate.mrr.merchantInfo();

    console.log("Merchant Info retrieved:", data.name);
    return data;
  } catch (error) {
    console.error('Error fetching Merchant Info:', error);
    throw error;
  }
}

/**
 * Retrieves revenue data and analytics.
 * Provides total revenue metrics for business reporting.
 * @returns Promise<RevenueData[]> - Array of revenue data points
 */
export async function getRevenue(): Promise<RevenueData[]> {
  try {
    // Fetch revenue analytics using SDK
    const data = await abacate.mrr.revenue();

    console.log("Revenue Data retrieved:", data.length, "entries");
    return data;
  } catch (error) {
    console.error('Error fetching Revenue:', error);
    throw error;
  }
}
