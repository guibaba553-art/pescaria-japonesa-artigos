import { describe, it, expect } from 'vitest';
import { buildPdvPaymentRows, buildPdvItemRows } from '../pdvSalePayload';

describe('buildPdvPaymentRows', () => {
  it('registra uma linha para venda com meio único', () => {
    const rows = buildPdvPaymentRows({
      parts: [{ method: 'credit', amount: 100, installments: 3 }],
      total: 100,
      splitMode: false,
    });
    expect(rows).toEqual([
      { payment_method: 'credit', amount: 100, installments: 3, cash_received: null },
    ]);
  });

  it('limita o dinheiro ao valor que falta cobrir e guarda o recebido', () => {
    const rows = buildPdvPaymentRows({
      parts: [
        { method: 'pix', amount: 60 },
        { method: 'cash', amount: 100 },
      ],
      total: 100,
      splitMode: true,
    });
    expect(rows[1]).toEqual({
      payment_method: 'cash',
      amount: 40,
      installments: 1,
      cash_received: 100,
    });
  });

  it('usa o valor digitado de dinheiro quando não é pagamento dividido', () => {
    const rows = buildPdvPaymentRows({
      parts: [{ method: 'cash', amount: 50 }],
      total: 50,
      splitMode: false,
      cashReceivedInput: '100,00',
    });
    expect(rows[0].cash_received).toBe(100);
    expect(rows[0].amount).toBe(50);
  });

  it('força 1 parcela para meios que não são crédito', () => {
    const rows = buildPdvPaymentRows({
      parts: [{ method: 'debit', amount: 20, installments: 5 }],
      total: 20,
      splitMode: false,
    });
    expect(rows[0].installments).toBe(1);
  });
});

describe('buildPdvItemRows', () => {
  it('rateia o desconto geral no preço unitário', () => {
    const rows = buildPdvItemRows(
      [{ productId: 'p1', variationId: 'v1', quantity: 2, unitPrice: 100 }],
      0.1,
    );
    expect(rows).toEqual([
      { product_id: 'p1', variation_id: 'v1', quantity: 2, price_at_purchase: 90 },
    ]);
  });

  it('mantém o preço quando não há desconto e normaliza variação ausente', () => {
    const rows = buildPdvItemRows([{ productId: 'p2', quantity: 1, unitPrice: 33.333 }], 0);
    expect(rows).toEqual([
      { product_id: 'p2', variation_id: null, quantity: 1, price_at_purchase: 33.33 },
    ]);
  });
});
