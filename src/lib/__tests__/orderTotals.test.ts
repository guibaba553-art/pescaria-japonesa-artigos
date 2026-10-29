import { describe, it, expect } from 'vitest';
import { getOrderTotals } from '../orderTotals';

describe('getOrderTotals', () => {
  it('preserves the charged 322.21 total even when historical items are missing', () => {
    expect(getOrderTotals({ total_amount: 322.21, shipping_cost: 0 })).toEqual({ total: 322.21, subtotal: 322.21 });
  });
  it('subtracts freight from the recorded total without recalculating item prices', () => {
    expect(getOrderTotals({ total_amount: 337.21, shipping_cost: 15 })).toEqual({ total: 337.21, subtotal: 322.21 });
  });
});