import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SearchSection } from '../SearchSection';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useCart', () => ({
  useCart: () => ({ addItem: vi.fn() }),
}));

vi.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    primaries: [
      { id: '1', name: 'Carretilhas', slug: 'carretilhas', is_primary: true, description: null, icon: null, display_order: 1, parent_id: null },
      { id: '2', name: 'Varas', slug: 'varas', is_primary: true, description: null, icon: null, display_order: 2, parent_id: null },
    ],
    getSubcategoriesOf: vi.fn(() => []),
  }),
}));

vi.mock('@/utils/promoPrice', () => ({
  effectiveProductOrVariationPrice: (p: any) => p.price ?? 0,
}));

let nextRpcResult: any = { data: [], error: null };
let nextFromResult: any = { data: [], error: null };

function createBuilder(initialResult?: any) {
  const result = initialResult ?? nextFromResult;
  const builder: Record<string, any> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    in: vi.fn(() => builder),
    then: (resolve: (v: any) => void) => Promise.resolve().then(() => resolve(result)),
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => createBuilder()),
    rpc: vi.fn(() => ({
      then: (resolve: (v: any) => void) => Promise.resolve().then(() => resolve(nextRpcResult)),
    })),
  },
}));

const sampleRpcResult = {
  data: [
    { id: 'prod-1', score: 0.9 },
    { id: 'prod-2', score: 0.7 },
  ],
  error: null,
};

const sampleProducts = [
  {
    id: 'prod-1', name: 'Carretilha Shimano', price: 300, sale_price: null, on_sale: false,
    sale_ends_at: null, sale_limit_qty: null, sale_sold_qty: null, min_sale_price: null,
    category: 'Carretilhas', subcategory: null, brand_id: null, brands: null,
    image_url: null, stock: 10, rating: 4.5, featured: false, minimum_quantity: 1,
    sold_by_weight: false, created_at: '2026-01-01',
    variations: [],
    brand: null,
  },
  {
    id: 'prod-2', name: 'Vara Shimano', price: 200, sale_price: null, on_sale: false,
    sale_ends_at: null, sale_limit_qty: null, sale_sold_qty: null, min_sale_price: null,
    category: 'Varas', subcategory: null, brand_id: null, brands: null,
    image_url: null, stock: 5, rating: 4.0, featured: false, minimum_quantity: 1,
    sold_by_weight: false, created_at: '2026-01-02',
    variations: [],
    brand: null,
  },
];

function renderSearch() {
  return render(
    <MemoryRouter>
      <SearchSection />
    </MemoryRouter>
  );
}

describe('SearchSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    nextRpcResult = { data: [], error: null };
    nextFromResult = { data: [], error: null };
  });

  it('renders search bar with updated placeholder', () => {
    renderSearch();
    const input = screen.getByPlaceholderText('Buscar por nome, marca, descrição...');
    expect(input).toBeDefined();
  });

  it('renders category select with "Todas Categorias"', () => {
    renderSearch();
    expect(screen.getByText('Todas Categorias')).toBeDefined();
  });

  it('shows results when RPC returns products', async () => {
    nextRpcResult = sampleRpcResult;
    nextFromResult = { data: sampleProducts, error: null };

    renderSearch();
    const input = screen.getByPlaceholderText('Buscar por nome, marca, descrição...');
    await userEvent.type(input, 'shimano');

    await waitFor(() => {
      expect(screen.getByText('Carretilha Shimano')).toBeDefined();
    }, { timeout: 1000 });
  });

  it('shows "Nenhum produto encontrado" when RPC returns empty', async () => {
    nextRpcResult = { data: [], error: null };

    renderSearch();
    const input = screen.getByPlaceholderText('Buscar por nome, marca, descrição...');
    await userEvent.type(input, 'xyznaoexiste');

    await waitFor(() => {
      expect(screen.getByText('Nenhum produto encontrado')).toBeDefined();
    }, { timeout: 1000 });
  });

  it('falls back to legacy ilike query when RPC fails', async () => {
    nextRpcResult = { data: null, error: { message: 'function not found' } };
    nextFromResult = { data: sampleProducts, error: null };

    renderSearch();
    const input = screen.getByPlaceholderText('Buscar por nome, marca, descrição...');
    await userEvent.type(input, 'shimano');

    await waitFor(() => {
      expect(screen.getByText('Carretilha Shimano')).toBeDefined();
    }, { timeout: 1000 });
  });

  it('navigates to product page on click', async () => {
    nextRpcResult = sampleRpcResult;
    nextFromResult = { data: sampleProducts, error: null };

    renderSearch();
    const input = screen.getByPlaceholderText('Buscar por nome, marca, descrição...');
    await userEvent.type(input, 'shimano');

    await waitFor(() => {
      const productButton = screen.getByText('Carretilha Shimano');
      productButton.click();
      expect(mockNavigate).toHaveBeenCalledWith('/produto/prod-1');
    }, { timeout: 1000 });
  });

  it('clears search results on clear button click', async () => {
    nextRpcResult = sampleRpcResult;
    nextFromResult = { data: sampleProducts, error: null };

    renderSearch();
    const input = screen.getByPlaceholderText('Buscar por nome, marca, descrição...');
    await userEvent.type(input, 'shimano');

    await waitFor(() => {
      expect(screen.getByText('Carretilha Shimano')).toBeDefined();
    });

    const clearBtn = screen.getByText('Limpar');
    clearBtn.click();

    await waitFor(() => {
      expect(screen.queryByText('Carretilha Shimano')).toBeNull();
    });
  });

  it('does not search with empty query and "all" category', async () => {
    renderSearch();
    await waitFor(() => {
      expect(screen.queryByText('Buscando...')).toBeNull();
    });
  });
});
