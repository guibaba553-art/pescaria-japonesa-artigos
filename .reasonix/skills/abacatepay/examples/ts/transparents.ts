import { AbacatePay } from '@abacatepay/sdk';

// Define types for transparent payment operations
export type TransparentRequest = {
  amount: number; // in cents
};

export type TransparentPayment = {
  id: string;
  amount: number;
  status: string;
  qrCode?: string;
  qrCodeText?: string;
  createdAt: string;
};

const abacate = AbacatePay({ secret: process.env.ABACATEPAY_API_KEY });

/**
 * Creates a transparent payment (PIX QR Code).
 * Returns QR code for customer to complete payment.
 * @returns Promise<TransparentPayment> - Payment with QR code details
 */
export async function createTransparent(): Promise<TransparentPayment> {
  try {
    // Create transparent payment with amount
    const payment = await abacate.transparents.create({
      amount: 10000, // Amount in cents (R$ 100.00)
    });

    console.log("Transparent payment created:", payment.id);
    return payment;
  } catch (error) {
    console.error("Error creating transparent payment:", error);
    throw error;
  }
}

/**
 * Simulates a payment for testing purposes.
 * Only works in dev mode - marks payment as completed.
 * @param id - Payment ID to simulate
 * @returns Promise<TransparentPayment> - Updated payment status
 */
export async function simulateTransparent(id: string): Promise<TransparentPayment> {
  try {
    // Simulate payment completion (dev mode only)
    const payment = await abacate.transparents.simulate({ id });

    console.log("Payment simulated:", payment.id);
    return payment;
  } catch (error) {
    console.error("Error simulating payment:", error);
    throw error;
  }
}

/**
 * Checks the status of a transparent payment.
 * Useful for polling payment completion.
 * @param id - Payment ID to check
 * @returns Promise<TransparentPayment> - Current payment status
 */
export async function checkTransparent(id: string): Promise<TransparentPayment> {
  try {
    // Check current payment status
    const payment = await abacate.transparents.check({ id });

    console.log("Payment status checked:", payment.id, payment.status);
    return payment;
  } catch (error) {
    console.error("Error checking payment:", error);
    throw error;
  }
}