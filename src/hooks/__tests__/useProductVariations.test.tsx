import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProductVariations } from '../useProductVariations';

const { mockRpc, mockToast } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mockRpc,
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

const variationRows = [
  {
    id: 'var-1',
    product_id: 'prod-1',
    name: 'Azul',
    price: 50,
    stock: 10,
    sku: 'SKU-A',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    description: null,
    image_url: null,
    weight_grams: null,
    length_cm: null,
    width_cm: null,
    height_cm: null,
    min_stock: 0,
    on_sale: false,
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
    sale_limit_qty: null,
    sale_sold_qty: 0,
    min_sale_price: null,
    sale_channel: 'both',
  },
  {
    id: 'var-2',
    product_id: 'prod-1',
    name: 'Verde',
    price: 60,
    stock: 5,
    sku: 'SKU-B',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    description: 'Vara 2m',
    image_url: null,
    weight_grams: 120,
    length_cm: 200,
    width_cm: null,
    height_cm: null,
    min_stock: 2,
    on_sale: true,
    sale_price: 45,
    sale_starts_at: '2026-01-01T00:00:00Z',
    sale_ends_at: '2026-02-01T00:00:00Z',
    sale_limit_qty: 10,
    sale_sold_qty: 3,
    min_sale_price: 40,
    sale_channel: 'site',
  },
];

beforeEach(() => {
  mockRpc.mockReset();
  mockToast.mockReset();
});

describe('useProductVariations data fetching', () => {
  it('deve chamar a RPC preservando o contexto do cliente', async () => {
    mockRpc.mockImplementation(function (this: unknown) {
      if (!this) throw new TypeError('contexto do cliente ausente');
      return Promise.resolve({ data: variationRows, error: null });
    });

    const { result } = renderHook(() => useProductVariations());

    await act(async () => {
      await result.current.loadVariations('prod-1');
    });

    expect(result.current.variations).toHaveLength(2);
  });

  it('deve chamar a RPC get_product_variations_by_product com o payload correto', async () => {
    mockRpc.mockResolvedValue({ data: variationRows, error: null });

    const { result } = renderHook(() => useProductVariations());

    await act(async () => {
      await result.current.loadVariations('prod-1');
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'get_product_variations_by_product',
      { p_product_id: 'prod-1' },
    );
  });

  it('deve popular variations com o retorno da RPC', async () => {
    mockRpc.mockResolvedValue({ data: variationRows, error: null });

    const { result } = renderHook(() => useProductVariations());

    await act(async () => {
      await result.current.loadVariations('prod-1');
    });

    expect(result.current.variations).toEqual(variationRows);
    expect(result.current.variations).toHaveLength(2);
    expect(result.current.loading).toBe(false);
  });

  it('deve limpar variations e exibir toast quando a RPC retorna erro', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Acesso negado' },
    });

    const { result } = renderHook(() => useProductVariations());

    await act(async () => {
      await result.current.loadVariations('prod-1');
    });

    expect(result.current.variations).toEqual([]);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro',
        description: 'Não foi possível carregar as variações',
        variant: 'destructive',
      }),
    );
    expect(result.current.loading).toBe(false);
  });
});