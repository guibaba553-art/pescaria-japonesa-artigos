import { describe, expect, it } from 'vitest';
import { aggregateProductSales } from '@/utils/productSalesAnalysis';

const orders = [
  { id: 'pdv-ok', created_at: '2026-09-10T12:00:00Z', status: 'entregado', source: 'pdv' },
  { id: 'site-ok', created_at: '2026-09-11T12:00:00Z', status: 'em_preparo', source: 'site' },
  { id: 'cancelled', created_at: '2026-09-11T12:00:00Z', status: 'cancelado', source: 'site' },
];

const items = [
  { order_id: 'pdv-ok', product_id: 'rod', quantity: 2, price_at_purchase: 50 },
  { order_id: 'site-ok', product_id: 'rod', quantity: 1, price_at_purchase: 60 },
  { order_id: 'site-ok', product_id: 'reel', quantity: 3, price_at_purchase: 40 },
  { order_id: 'cancelled', product_id: 'rod', quantity: 99, price_at_purchase: 50 },
];

const products = [
  { id: 'rod', name: 'Vara Evolution' },
  { id: 'reel', name: 'Molinete Titan' },
];

describe('análise de vendas por produto ou grupo', () => {
  it('soma quantidade, receita e vendas de um produto nos canais válidos', () => {
    const result = aggregateProductSales({ orders, items, products, productIds: new Set(['rod']), channel: 'all' });

    expect(result.totals).toEqual({ quantity: 3, revenue: 160, orders: 2, averagePrice: 160 / 3 });
    expect(result.byDay).toHaveLength(2);
  });

  it('filtra a origem e agrega vários produtos de um grupo', () => {
    const result = aggregateProductSales({
      orders,
      items,
      products,
      productIds: new Set(['rod', 'reel']),
      channel: 'site',
    });

    expect(result.totals.quantity).toBe(4);
    expect(result.totals.revenue).toBe(180);
    expect(result.totals.orders).toBe(1);
    expect(result.products.map((row) => row.name)).toEqual(['Molinete Titan', 'Vara Evolution']);
  });
});