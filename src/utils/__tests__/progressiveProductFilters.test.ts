import { describe, expect, it } from 'vitest';
import { filterProductsByFacets } from '../progressiveProductFilters';

const products = [
  { id: 'a', brand: 'Marine Sports', pound_test: '17 lb', size: '1,80 m', subcategory: null },
  { id: 'b', brand: 'Marine Sports', pound_test: '20 lb', size: '1,80 m', subcategory: null },
  { id: 'c', brand: 'Outra', pound_test: '17 lb', size: '1,65 m', subcategory: null },
];

describe('filterProductsByFacets', () => {
  it('combina marca, libragem e tamanho por interseção', () => {
    const result = filterProductsByFacets(products, {
      brands: ['Marine Sports'],
      pounds: ['17 lb'],
      sizes: ['1,80 m'],
      groupIds: [],
    }, new Map());

    expect(result.map((product) => product.id)).toEqual(['a']);
  });

  it('não presume que todo produto do mesmo tamanho tenha a mesma libragem', () => {
    const result = filterProductsByFacets(products, {
      brands: [],
      pounds: ['17 lb'],
      sizes: ['1,80 m'],
      groupIds: [],
    }, new Map());

    expect(result.map((product) => product.id)).toEqual(['a']);
  });

  it('exige que o produto pertença a todos os grupos independentes escolhidos', () => {
    const memberships = new Map([
      ['a', new Set(['g1', 'g2'])],
      ['b', new Set(['g1'])],
    ]);
    const result = filterProductsByFacets(products, {
      brands: [], pounds: [], sizes: [], groupIds: ['g1', 'g2'],
    }, memberships);

    expect(result.map((product) => product.id)).toEqual(['a']);
  });
});