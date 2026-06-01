import { describe, it, expect } from 'vitest';
import { getStockMessage } from '../stockDisplay';

describe('getStockMessage — mensagem de estoque na página do produto', () => {
  it('retorna null quando estoque é 0', () => {
    expect(getStockMessage(0)).toBeNull();
  });

  it('retorna mensagem de alerta quando estoque <= 10', () => {
    expect(getStockMessage(1)).toBe('⚠️ Apenas 1 unidade em estoque');
    expect(getStockMessage(5)).toBe('⚠️ Apenas 5 unidades em estoque');
    expect(getStockMessage(10)).toBe('⚠️ Apenas 10 unidades em estoque');
  });

  it('retorna null quando estoque > 10 (não mostra nada)', () => {
    expect(getStockMessage(11)).toBeNull();
    expect(getStockMessage(50)).toBeNull();
    expect(getStockMessage(100)).toBeNull();
  });

  it('usa singular para 1 unidade', () => {
    expect(getStockMessage(1)).toBe('⚠️ Apenas 1 unidade em estoque');
  });
});
