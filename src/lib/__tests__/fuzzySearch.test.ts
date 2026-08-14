import { describe, it, expect } from 'vitest';
import { normalizeText, tokenize, levenshtein, fuzzyScore, fuzzySearch } from '../fuzzySearch';

describe('normalizeText', () => {
  it('remove acentos, caixa e pontuação', () => {
    expect(normalizeText('Varão 30LB - Shimano!')).toBe('varao 30lb shimano');
  });
});

describe('tokenize', () => {
  it('quebra em termos', () => {
    expect(tokenize('  linha  multi-filamento ')).toEqual(['linha', 'multi', 'filamento']);
  });
});

describe('levenshtein', () => {
  it('calcula distância', () => {
    expect(levenshtein('shimano', 'shimanno')).toBe(1);
  });
});

describe('fuzzyScore', () => {
  it('casa termo exato', () => {
    expect(fuzzyScore('Carretilha Shimano', 'carretilha')).toBeGreaterThan(0);
  });
  it('ignora acentos', () => {
    expect(fuzzyScore('Varão de pesca', 'varao')).toBeGreaterThan(0);
  });
  it('tolera erro de digitação', () => {
    expect(fuzzyScore('Carretilha Shimano', 'shimanno')).toBeGreaterThan(0);
    expect(fuzzyScore('Carretilha Shimano', 'carretila')).toBeGreaterThan(0);
  });
  it('aceita palavras fora de ordem', () => {
    expect(fuzzyScore('Carretilha Shimano 200', 'shimano carretilha')).toBeGreaterThan(0);
  });
  it('exige que todos os termos batam', () => {
    expect(fuzzyScore('Carretilha Shimano', 'carretilha daiwa')).toBe(0);
  });
  it('retorna 0 para busca vazia', () => {
    expect(fuzzyScore('Carretilha', '   ')).toBe(0);
  });
  it('pontua prefixo acima de substring', () => {
    expect(fuzzyScore('Anzol Chinu', 'anzol')).toBeGreaterThan(fuzzyScore('Kit com anzol', 'nzol'));
  });
});

describe('fuzzySearch', () => {
  const items = [
    { name: 'Carretilha Shimano', brand: 'Shimano' },
    { name: 'Vara Daiwa', brand: 'Daiwa' },
    { name: 'Anzol Chinu', brand: null },
  ];
  const fields = (i: typeof items[number]) => [i.name, i.brand];

  it('ordena por relevância e filtra', () => {
    const r = fuzzySearch(items, 'shimano', fields);
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('Carretilha Shimano');
  });

  it('respeita o limite', () => {
    expect(fuzzySearch(items, '', fields, 2)).toHaveLength(2);
  });

  it('encontra mesmo com erro de digitação', () => {
    expect(fuzzySearch(items, 'daiw', fields)[0].name).toBe('Vara Daiwa');
  });
});
