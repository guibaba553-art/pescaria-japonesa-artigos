import { describe, it, expect } from 'vitest';
import { computeDRE, expensesInPeriod } from '../dre';

describe('expensesInPeriod', () => {
  it('conta gasto variável só na data e fixo proporcional aos dias', () => {
    const r = expensesInPeriod(
      [
        { id: 'a', type: 'variable', category: 'Frete', amount: 100, expense_date: '2026-10-01', end_date: null },
        { id: 'b', type: 'variable', category: 'Frete', amount: 999, expense_date: '2026-09-10', end_date: null },
        { id: 'c', type: 'fixed', category: 'Aluguel', amount: 3100, expense_date: '2026-01-05', end_date: null },
        { id: 'd', type: 'variable', category: 'Mercadoria', amount: 5000, expense_date: '2026-10-01', end_date: null },
      ],
      [],
      '2026-10-01',
      '2026-10-02',
    );
    expect(r.byCategory['Frete']).toBe(100);
    expect(r.byCategory['Aluguel']).toBeCloseTo(200, 2); // 3100 * 2/31
    expect(r.byCategory['Mercadoria']).toBe(5000);
  });

  it('respeita mês pulado e valor alterado', () => {
    const r = expensesInPeriod(
      [{ id: 'c', type: 'fixed', category: 'Aluguel', amount: 3000, expense_date: '2026-01-05', end_date: null }],
      [{ expense_id: 'c', year_month: '2026-09', amount: 1500, skipped: false }],
      '2026-09-01',
      '2026-10-31',
    );
    expect(r.byCategory['Aluguel']).toBeCloseTo(4500, 2);
  });
});

describe('computeDRE', () => {
  it('não desconta compra de mercadoria nem DAS como despesa', () => {
    const d = computeDRE({
      productRevenue: 1000, freightRevenue: 0, returns: 0, simplesRate: 6, cmv: 500, paymentFees: 20,
      expensesByCategory: { Mercadoria: 50000, Impostos: 7000, Aluguel: 200, Frete: 30, Financiamento: 10 },
    });
    expect(d.receitaBruta).toBe(1000);
    expect(d.impostos).toBeCloseTo(60);
    expect(d.lucroBruto).toBeCloseTo(440);
    expect(d.despesasVendas).toBeCloseTo(50);
    expect(d.despesasAdministrativas).toBeCloseTo(200);
    expect(d.despesasFinanceiras).toBeCloseTo(10);
    expect(d.resultadoLiquido).toBeCloseTo(180);
    expect(d.comprasMercadoria).toBe(50000);
    expect(d.dasPago).toBe(7000);
  });
});
