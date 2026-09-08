import { describe, it, expect } from 'vitest';
import { summarizeSalesByMethod } from '@/utils/salesPaymentSummary';

describe('resumo de vendas por meio de pagamento', () => {
  it('usa o método do pedido quando não há rateio', () => {
    const s = summarizeSalesByMethod([
      { id: '1', total_amount: 100, payment_method: 'dinheiro' },
      { id: '2', total_amount: 50, payment_method: 'credit' },
      { id: '3', total_amount: 30, payment_method: 'pix' },
    ]);
    expect(s).toEqual({ cash: 100, card: 50, pix: 30, other: 0 });
  });

  it('divide a venda paga com vários meios', () => {
    const s = summarizeSalesByMethod(
      [{ id: '1', total_amount: 233.37, payment_method: 'credit' }],
      [
        { order_id: '1', payment_method: 'credit', amount: 76 },
        { order_id: '1', payment_method: 'cash', amount: 157.37 },
      ],
    );
    expect(s.cash).toBeCloseTo(157.37, 2);
    expect(s.card).toBeCloseTo(76, 2);
  });

  it('ignora o método do pedido quando existe rateio', () => {
    const s = summarizeSalesByMethod(
      [{ id: '1', total_amount: 100, payment_method: 'credit' }],
      [
        { order_id: '1', payment_method: 'pix', amount: 40 },
        { order_id: '1', payment_method: 'cash', amount: 60 },
      ],
    );
    expect(s.card).toBe(0);
    expect(s.pix).toBeCloseTo(40, 2);
    expect(s.cash).toBeCloseTo(60, 2);
  });
});
