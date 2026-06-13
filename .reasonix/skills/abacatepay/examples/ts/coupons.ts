import { AbacatePay } from '@abacatepay/sdk';

// Define types for coupon operations
export type CouponRequest = {
  code: string;
  discountKind: "PERCENTAGE" | "FIXED";
  discount: number; // percentage or amount in cents
  maxRedeems: number; // -1 for unlimited
  notes?: string;
  metadata?: Record<string, any>;
};

export type Coupon = {
  id: string;
  code: string;
  discountKind: "PERCENTAGE" | "FIXED";
  discount: number;
  maxRedeems: number;
  redeemsCount: number;
  notes: string | null;
  status: boolean;
  createdAt: string;
  updatedAt: string;
};

const abacate = AbacatePay({ secret: process.env.ABACATEPAY_API_KEY });

/**
 * Creates a new discount coupon.
 * Coupons can be percentage or fixed amount discounts.
 * @returns Promise<Coupon> - Created coupon object
 */
export async function createCoupon(): Promise<Coupon> {
  try {
    // Create coupon with discount details
    const coupon = await abacate.coupons.create({
      code: "MY_COUPON", // Unique coupon code
      discountKind: "PERCENTAGE", // or "FIXED"
      discount: 10, // 10% discount or amount in cents
      maxRedeems: -1, // -1 for unlimited redeems
      notes: "Cupom de desconto especial", // Optional notes
      metadata: {
        campaign: "black-friday" // Optional tracking data
      }
    });

    console.log("Coupon created:", coupon.id);
    return coupon;
  } catch (error) {
    console.error("Error creating coupon:", error);
    throw error;
  }
}

/**
 * Lists all coupons with their status and usage.
 * Useful for coupon management dashboards.
 * @returns Promise<Coupon[]> - Array of coupons
 */
export async function listCoupons(): Promise<Coupon[]> {
  try {
    // Retrieve all coupons for management
    const coupons = await abacate.coupons.list();

    console.log("Coupons retrieved:", coupons.length, "items");
    return coupons;
  } catch (error) {
    console.error("Error listing coupons:", error);
    throw error;
  }
}

/**
 * Retrieves a specific coupon by ID.
 * Useful for validation or detailed coupon info.
 * @param id - Coupon ID to retrieve
 * @returns Promise<Coupon> - Coupon details
 */
export async function getCoupon(id: string): Promise<Coupon> {
  try {
    // Get specific coupon details
    const coupon = await abacate.coupons.get({ id });

    console.log("Coupon retrieved:", coupon.id);
    return coupon;
  } catch (error) {
    console.error("Error getting coupon:", error);
    throw error;
  }
}
