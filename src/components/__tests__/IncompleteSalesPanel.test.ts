import { describe, it, expect } from 'vitest';
import { describeIncompleteSale, type IncompleteSale } from '../IncompleteSalesPanel';

const base: IncompleteSale = {
  order_id: 'dd52ca71-0000-0000-0000-000000000000',
  created_at: '2026-08-20T20:41:00Z',
  source: 'pdv',
  status: 'entregado',
  payment_method: 'credit',
  total_amount: 2200,
  customer_name: 'Guilherme',
  item_count: 0,
  stock_movement_count: 0,
  has_fiscal: true,
};

describe('describeIncompleteSale', () => {
  it('aponta produtos, estoque e nota fiscal', () => {
    expect(describeIncompleteSale(base)).toBe('sem produtos · sem baixa de estoque · nota fiscal emitida');
  });

  it('aponta só o estoque quando os produtos existem', () => {
    expect(describeIncompleteSale({ ...base, item_count: 2, has_fiscal: false })).toBe('sem baixa de estoque');
  });

  it('aponta só os produtos quando o estoque já baixou', () => {
    expect(describeIncompleteSale({ ...base, stock_movement_count: 3, has_fiscal: false })).toBe('sem produtos');
  });
});
