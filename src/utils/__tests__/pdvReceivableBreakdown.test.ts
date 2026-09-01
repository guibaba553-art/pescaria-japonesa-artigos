import { describe, it, expect } from 'vitest';
import { getPdvReceivableBreakdown } from '@/utils/pdvReceivableBreakdown';

// 28/08/2026 é sexta-feira; débito liquida na segunda 31/08.
const debitFriday = {
  id: 'a',
  created_at: new Date(2026, 7, 28, 10, 0).toISOString(),
  total_amount: 100,
  payment_method: 'debit',
  installments: 1,
};

// Crédito 1x de 01/08 → D+30 = 31/08 (segunda).
const creditAug1 = {
  id: 'b',
  created_at: new Date(2026, 7, 1, 10, 0).toISOString(),
  total_amount: 200,
  payment_method: 'credit',
  installments: 1,
};

describe('detalhamento do recebível do PDV', () => {
  it('lista débito de sexta e crédito D+30 na mesma liquidação de segunda', () => {
    const b = getPdvReceivableBreakdown('2026-08-31', [debitFriday, creditAug1]);
    expect(b.lines).toHaveLength(2);
    expect(b.totalGross).toBeCloseTo(300, 2);
    expect(b.totalFee).toBeCloseTo(100 * 0.0106 + 200 * 0.023, 2);
    expect(b.totalNet).toBeCloseTo(b.totalGross - b.totalFee, 2);
  });

  it('ignora vendas que liquidam em outro dia', () => {
    expect(getPdvReceivableBreakdown('2026-08-30', [debitFriday, creditAug1]).lines).toHaveLength(0);
  });

  it('marca a parcela correta no crédito parcelado', () => {
    const parcelado = { ...creditAug1, id: 'c', installments: 3, total_amount: 300 };
    const b = getPdvReceivableBreakdown('2026-08-31', [parcelado]);
    expect(b.lines[0].parcelIndex).toBe(1);
    expect(b.lines[0].parcelCount).toBe(3);
    expect(b.lines[0].gross).toBeCloseTo(100, 2);
  });
});
