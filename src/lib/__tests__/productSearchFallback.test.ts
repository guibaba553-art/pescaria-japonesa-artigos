import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchProductsFallback } from '../productSearchFallback';

let nextResult: any = { data: [], error: null };

function createBuilder() {
  const builder: Record<string, any> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    then: (resolve: (v: any) => void) => Promise.resolve().then(() => resolve(nextResult)),
  };
  return builder;
}

const mockSupabase = {
  from: vi.fn(() => createBuilder()),
};

describe('searchProductsFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextResult = { data: [], error: null };
  });

  it('returns products matching name', async () => {
    nextResult = {
      data: [
        { id: '1', name: 'Carretilha Shimano', price: 200, stock: 5, image_url: null, category: 'Carretilhas', rating: 4, featured: false, minimum_quantity: 1, sold_by_weight: false, on_sale: false },
      ],
      error: null,
    };

    const result = await searchProductsFallback(mockSupabase as any, 'Carretilha', 'all');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Carretilha Shimano');
    expect(mockSupabase.from).toHaveBeenCalledWith('products');
  });

  it('excludes pdv_only products', async () => {
    const builder = createBuilder();
    builder.eq = vi.fn((col, val) => {
      if (col === 'pdv_only') {
        expect(val).toBe(false);
      }
      return builder;
    });
    mockSupabase.from = vi.fn(() => builder);
    nextResult = { data: [], error: null };

    await searchProductsFallback(mockSupabase as any, 'test', 'all');
  });

  it('excludes zero-stock products', async () => {
    const builder = createBuilder();
    builder.gt = vi.fn((col, val) => {
      if (col === 'stock') {
        expect(val).toBe(0);
      }
      return builder;
    });
    mockSupabase.from = vi.fn(() => builder);
    nextResult = { data: [], error: null };

    await searchProductsFallback(mockSupabase as any, 'test', 'all');
  });

  it('passes category filter when not "all"', async () => {
    const builder = createBuilder();
    builder.eq = vi.fn(() => builder);
    mockSupabase.from = vi.fn(() => builder);
    nextResult = { data: [], error: null };

    await searchProductsFallback(mockSupabase as any, 'test', 'Carretilhas');
  });

  it('returns empty array on network error', async () => {
    nextResult = new Error('fetch failed') as any;

    const result = await searchProductsFallback(mockSupabase as any, 'test', 'all');
    expect(result).toEqual([]);
  });

  it('returns empty array when query is empty and category is "all"', async () => {
    nextResult = { data: [], error: null };

    const result = await searchProductsFallback(mockSupabase as any, '', 'all');
    expect(result).toEqual([]);
  });

  it('respects result limit', async () => {
    nextResult = {
      data: [
        { id: '1', name: 'A', price: 10, stock: 1, image_url: null, category: 'X', rating: 3, featured: false, minimum_quantity: 1, sold_by_weight: false, on_sale: false },
        { id: '2', name: 'B', price: 10, stock: 1, image_url: null, category: 'X', rating: 3, featured: false, minimum_quantity: 1, sold_by_weight: false, on_sale: false },
      ],
      error: null,
    };

    const result = await searchProductsFallback(mockSupabase as any, 'test', 'all', 2);
    expect(result).toHaveLength(2);
  });
});
