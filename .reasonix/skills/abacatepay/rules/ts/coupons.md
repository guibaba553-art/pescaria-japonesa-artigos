# Coupon Management

Manage discounts for your checkouts and subscriptions.

## Operations
- **Create**: Create percentage or fixed value coupons.
- **List/Get**: Retrieve coupon details.
- **Toggle**: Enable/Disable a coupon.
- **Delete**: Remove a coupon.

## TS Example
(Source: `examples/ts/coupons.ts`)

// See examples/ts/coupons.ts
export async function createCoupon() {
  try {
    const coupon = await abacate.coupons.create({
      code: "MY_COUPON",
      discountKind: "PERCENTAGE",
      discount: 10,
      maxRedeems: -1,
      notes: "Cupom de desconto especial",
      metadata: {
        campaign: "black-friday"
      }
    });

    console.log("Coupon created:", coupon.id);
    return coupon;
  } catch (error) {
    console.error("Error creating coupon:", error);
    throw error;
  }
}

export async function listCoupons() {
  try {
    const coupons = await abacate.coupons.list();

    console.log("Coupons retrieved");
    return coupons;
  } catch (error) {
    console.error("Error listing coupons:", error);
    throw error;
  }
}

export async function getCoupon(id: string) {
  try {
    const coupon = await abacate.coupons.get({ id });

    console.log("Coupon retrieved:", coupon.id);
    return coupon;
  } catch (error) {
    console.error("Error getting coupon:", error);
    throw error;
  }
}