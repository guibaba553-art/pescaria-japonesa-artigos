/** Recorded order amount is authoritative, even if item history is incomplete. */
export function getOrderTotals(order: { total_amount: number; shipping_cost: number | null }) {
  const total = Number(order.total_amount);
  return { total, subtotal: total - Number(order.shipping_cost || 0) };
}