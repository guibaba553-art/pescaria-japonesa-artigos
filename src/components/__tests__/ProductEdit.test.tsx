import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';

// ─── Mocks ────────────────────────────────────────────────
const { mockFrom, mockStorageFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
    storage: { from: mockStorageFrom },
    rpc: mockRpc,
    functions: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    session: null,
    permissions: { pdv: true, catalog: true },
    isAdmin: true,
    loading: false,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    categories: [],
    primaries: [],
    getSubcategoriesOf: vi.fn(() => []),
  }),
}));

vi.mock('@/hooks/useProductVariations', () => {
  const loadFn = vi.fn().mockResolvedValue(undefined);
  return {
    useProductVariations: () => ({
      variations: [],
      setVariations: vi.fn(),
      loading: false,
      loadVariations: loadFn,
      saveVariations: vi.fn().mockResolvedValue(undefined),
      resetVariations: vi.fn(),
    }),
  };
});

const createMockQuery = () => {
  const query: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: { id: 'mock-id' }, error: null }),
    order: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: any) => resolve({ data: [], error: null })),
  };
  return query;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue(createMockQuery());
  mockStorageFrom.mockReturnValue({
    upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/img.jpg' } }),
    remove: vi.fn().mockResolvedValue({ data: {}, error: null }),
  });
  mockRpc.mockResolvedValue({ data: {}, error: null });
});

// ─── Import após os mocks ─────────────────────────────────
import { ProductEdit } from '../ProductEdit';

const baseProduct = {
  id: 'test-1',
  name: 'Produto Teste',
  description: '',
  price: 10,
  category: 'Varas',
  image_url: null,
  rating: 0,
  stock: 5,
  featured: false,
  on_sale: false,
};

describe('ProductEdit — botão PDV no cabeçalho', () => {
  it('deve exibir o botão PDV ao lado de Destaque no cabeçalho', async () => {
    await act(async () => {
      render(
        <ProductEdit
          mode="edit"
          product={baseProduct}
          onUpdate={vi.fn()}
          open={true}
        />
      );
    });

    // Aguarda efeitos assíncronos estabilizarem
    await waitFor(() => {
      expect(screen.getByText('Destaque')).toBeTruthy();
    });

    // RED: botão PDV ainda não foi implementado no cabeçalho
    expect(screen.getByText('Exclusivo PDV')).toBeTruthy();
  });

  it('NÃO deve exibir a seção "Configurações Especiais"', async () => {
    await act(async () => {
      render(
        <ProductEdit
          mode="edit"
          product={baseProduct}
          onUpdate={vi.fn()}
          open={true}
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Destaque')).toBeTruthy();
    });

    // RED: esta seção ainda existe no código atual
    expect(screen.queryByText('Configurações Especiais')).toBeNull();
  });
});
