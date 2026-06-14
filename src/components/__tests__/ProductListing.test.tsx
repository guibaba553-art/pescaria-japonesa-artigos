import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProductListing } from '../ProductListing';

// ─── Variável compartilhada para controlar o resultado da query ──
let nextResult: any = { data: [], error: null };

function createBuilder() {
  const resolveValue = nextResult;
  const builder: Record<string, any> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: (resolve: (v: any) => void, reject: (e: any) => void) => {
      if (resolveValue instanceof Error) {
        setTimeout(() => reject(resolveValue), 5);
      } else {
        setTimeout(() => resolve(resolveValue), 5);
      }
    },
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => createBuilder()),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false, isAdmin: false, isEmployee: false, permissions: {}, signOut: vi.fn() }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    categories: [],
    primaries: [
      { id: '1', name: 'Carretilhas', slug: 'carretilhas', is_primary: true, description: null, icon: null, display_order: 1, parent_id: null },
      { id: '2', name: 'Varas', slug: 'varas', is_primary: true, description: null, icon: null, display_order: 2, parent_id: null },
    ],
    getSubcategoriesOf: vi.fn(() => []),
  }),
}));

vi.mock('@/hooks/useCart', () => ({
  useCart: () => ({ items: [], addItem: vi.fn(), removeItem: vi.fn(), lastAddedKey: null, clearLastAdded: vi.fn(), itemCount: 0 }),
}));

vi.mock('@/hooks/useProductQuantity', () => ({
  useProductQuantity: () => ({ getQuantity: vi.fn(() => 1), setQuantity: vi.fn(), incrementQuantity: vi.fn(), decrementQuantity: vi.fn() }),
}));

vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: any) => <>{children}</>,
}));

// ─── Helpers ─────────────────────────────────────────────

const sampleProducts = (category: string) => [
  {
    id: '1',
    name: `Produto ${category}`,
    price: 100,
    category,
    subcategory: null,
    image_url: null,
    images: [],
    stock: 10,
    rating: 4.5,
    featured: false,
    on_sale: false,
    brand: null,
    pound_test: null,
    size: null,
    description: '',
    minimum_quantity: 1,
    sold_by_weight: false,
    created_at: new Date().toISOString(),
  },
];

function clickCategoryButton(name: string) {
  const buttons = screen.getAllByText(name);
  buttons[buttons.length - 1].click();
}

const renderProductListing = (initialEntries = ['/produtos']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <ProductListing />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  nextResult = { data: [], error: null };
});

// ─── Tests ───────────────────────────────────────────────

describe('ProductListing', () => {
  it('deve mostrar "Nenhum produto" se vazio', async () => {
    nextResult = { data: [], error: null };
    renderProductListing();

    await waitFor(() => {
      expect(screen.getByText(/Nenhum/i)).toBeTruthy();
    });
  });

  it('deve mostrar produtos após carregar', async () => {
    nextResult = { data: sampleProducts('Varas'), error: null };
    renderProductListing();

    await waitFor(() => {
      expect(screen.getByText('Produto Varas')).toBeTruthy();
    });
  });

  it('deve trocar produtos ao clicar em uma categoria', async () => {
    nextResult = { data: sampleProducts('Geral'), error: null };
    renderProductListing();

    await waitFor(() => {
      expect(screen.getByText('Produto Geral')).toBeTruthy();
    });

    // Muda o resultado para a próxima query
    nextResult = { data: sampleProducts('Carretilhas'), error: null };

    await act(async () => {
      clickCategoryButton('Carretilhas');
    });

    await waitFor(() => {
      expect(screen.getByText('Produto Carretilhas')).toBeTruthy();
    });
  });

  it('deve continuar funcionando se loadProducts lançar exceção (loading=false)', async () => {
    // Próximo builder rejeitará
    nextResult = new Error('Rede falhou');

    renderProductListing();

    await waitFor(() => {
      expect(screen.getByText(/Nenhum/i)).toBeTruthy();
    });
  });
});
