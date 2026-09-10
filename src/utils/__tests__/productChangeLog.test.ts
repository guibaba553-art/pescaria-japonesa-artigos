import { describe, it, expect } from 'vitest';
import { fieldLabel, formatChangeValue } from '../productChangeLog';

describe('productChangeLog', () => {
  it('traduz nomes de campos', () => {
    expect(fieldLabel('sku')).toBe('Código de barras / SKU');
    expect(fieldLabel('stock')).toBe('Estoque');
    expect(fieldLabel('campo_novo')).toBe('campo_novo');
  });

  it('formata valores monetários', () => {
    expect(formatChangeValue('price', '197.10')).toContain('197,10');
    expect(formatChangeValue('stock', '2')).toBe('2');
  });

  it('mostra traço para valores vazios', () => {
    expect(formatChangeValue('sale_price', null)).toBe('—');
    expect(formatChangeValue('sale_price', '')).toBe('—');
  });
});
