/**
 * Shared stock handler for payment confirmation flows.
 *
 * Centralizes post-payment stock logic so all webhooks and payment
 * processors call the same function instead of duplicating inline code.
 *
 * Idempotency guarantee:
 * - `release_stock_reservation` is idempotent (sets released_at; second run is a no-op)
 * - `subtract-stock` → `apply_stock_movement` checks for existing sale movements
 *   per order_id+product_id before applying, so double-calls are harmless.
 *
 * Errors are logged but never thrown — the caller must not fail due to stock.
 *
 * Returns stock subtraction result for callers that need auto-refund logic.
 */

export async function handlePaymentConfirmed(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  orderId: string,
): Promise<{ stockSuccess: boolean; stockErrors: any[] }> {
  // 1. Release stock reservation
  try {
    await supabase.rpc("release_stock_reservation", { p_order_id: orderId });
  } catch (err) {
    console.error(`[stockHandler] Error releasing stock reservation for order ${orderId}:`, err);
  }

  // 2. Subtract real stock via internal edge function call
  try {
    const stockResponse = await fetch(
      `${supabaseUrl}/functions/v1/subtract-stock`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          "User-Agent": "JapasPesca/1.0.0",
        },
        body: JSON.stringify({ orderId }),
      },
    );

    if (stockResponse.ok) {
      const stockData = await stockResponse.json();
      console.log(`[stockHandler] Stock subtraction result for order ${orderId}:`, stockData);
      if (stockData.success === false && Array.isArray(stockData.errors) && stockData.errors.length > 0) {
        return { stockSuccess: false, stockErrors: stockData.errors };
      }
      return { stockSuccess: true, stockErrors: [] };
    } else {
      const errText = await stockResponse.text();
      console.error(`[stockHandler] Failed to subtract stock for order ${orderId}:`, errText);
      return { stockSuccess: false, stockErrors: [{ error: errText }] };
    }
  } catch (err) {
    console.error(`[stockHandler] Error calling subtract-stock for order ${orderId}:`, err);
    return { stockSuccess: false, stockErrors: [{ error: String(err) }] };
  }
}
