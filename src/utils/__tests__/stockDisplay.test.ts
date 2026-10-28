import { describe, it, expect } from 'vitest';
import { getStockMessage, getPdvDisplayStock } from '../stockDisplay';

describe('getPdvDisplayStock', () => {
  it('ignora o saldo antigo de 1 da Dragon quando as quatro variações estão zeradas', () => {
    expect(getPdvDisplayStock({ stock: 1, variations: [
      { stock: 0 }, { stock: 0 }, { stock: 0 }, { stock: 0 },
    ] })).toBe(0);
  });

  it('soma somente o estoque disponível das variações', () => {
    expect(getPdvDisplayStock({ stock: 99, variations: [
      { stock: 2 }, { stock: 3 }, { stock: 0 }, { stock: -1 },
    ] })).toBe(5);
  });

  it('usa o estoque principal apenas em produtos sem variações', () => {
    expect(getPdvDisplayStock({ stock: 1 })).toBe(1);
    expect(getPdvDisplayStock({ stock: 1, variations: [] })).toBe(1);
  });
});

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
