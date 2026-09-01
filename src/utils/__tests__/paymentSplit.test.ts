import { describe, it, expect } from 'vitest';
import { validateSplit, splitChange, primaryPart, sumParts } from '@/utils/paymentSplit';

describe('pagamento dividido do PDV', () => {
  it('aceita quando as partes fecham o total', () => {
    const parts = [
      { method: 'credit', amount: 76, installments: 1 },
      { method: 'cash', amount: 157.37 },
    ];
    const v = validateSplit(233.37, parts);
    expect(v.valid).toBe(true);
    expect(sumParts(parts)).toBeCloseTo(233.37, 2);
  });

  it('recusa quando falta valor', () => {
    const v = validateSplit(233.37, [{ method: 'credit', amount: 76, installments: 1 }]);
    expect(v.valid).toBe(false);
    expect(v.remaining).toBeCloseTo(157.37, 2);
  });

  it('recusa crédito sem parcelas', () => {
    const v = validateSplit(100, [{ method: 'credit', amount: 100 }]);
    expect(v.valid).toBe(false);
    expect(v.error).toMatch(/parcelas/i);
  });

  it('recusa cartão acima do total', () => {
    const v = validateSplit(100, [{ method: 'debit', amount: 120 }]);
    expect(v.valid).toBe(false);
  });

  it('permite dinheiro a mais e calcula troco', () => {
    const parts = [
      { method: 'debit', amount: 50 },
      { method: 'cash', amount: 60 },
    ];
    expect(validateSplit(100, parts).valid).toBe(true);
    expect(splitChange(100, parts)).toBeCloseTo(10, 2);
  });

  it('define a maior parte como método principal', () => {
    expect(
      primaryPart([
        { method: 'cash', amount: 40 },
        { method: 'credit', amount: 60, installments: 3 },
      ])?.method,
    ).toBe('credit');
  });
});
