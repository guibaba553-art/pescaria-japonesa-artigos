import { describe, it, expect } from 'vitest';
import { savedSaleItemUnitPrice } from '../savedSaleItemPrice';

describe('savedSaleItemUnitPrice', () => {
  it('usa o preço manual quando informado', () => {
    expect(savedSaleItemUnitPrice({ customPrice: 18, product: { price: 17 }, quantity: 1 })).toBe(18);
  });

  it('ignora preço de site zerado na variação e usa o preço do PDV', () => {
    const item = {
      product: { name: 'ANZOL MARUSEIGO ENCASTROADO 10 UNI', price: 7.99, price_pdv: 7.99 },
      variation: { name: 'MARUSEIGO 28 FLEX', price: 0, price_pdv: 23.88 },
      quantity: 10,
    };
    expect(savedSaleItemUnitPrice(item)).toBe(23.88);
  });

  it('usa o preço do site da variação quando não há preço de PDV', () => {
    const item = {
      product: { name: 'X', price: 10 },
      variation: { name: 'V', price: 15 },
      quantity: 1,
    };
    expect(savedSaleItemUnitPrice(item)).toBe(15);
  });

  it('cai para o preço do produto quando a variação não tem preço', () => {
    const item = {
      product: { name: 'X', price: 10, price_pdv: 12 },
      variation: { name: 'V', price: 0 },
      quantity: 1,
    };
    expect(savedSaleItemUnitPrice(item)).toBe(12);
  });

  it('retorna 0 quando nada está cadastrado', () => {
    expect(savedSaleItemUnitPrice({ product: {}, quantity: 1 })).toBe(0);
  });
});
