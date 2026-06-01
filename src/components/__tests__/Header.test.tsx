import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ─── Mocks ────────────────────────────────────────────────
const mockSupabaseQuery = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gt: vi.fn().mockReturnThis(),
  ilike: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => mockSupabaseQuery),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
    rpc: vi.fn(),
    functions: vi.fn(),
    storage: { from: vi.fn() },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    isAdmin: false,
    isEmployee: false,
    permissions: {},
    signOut: vi.fn(),
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

vi.mock('@/hooks/useCart', () => ({
  useCart: () => ({ items: [], addItem: vi.fn(), removeItem: vi.fn(), lastAddedKey: null, clearLastAdded: vi.fn(), itemCount: 0 }),
}));

// ─── Component under test ──────────────────────────────────
import { Header } from '../Header';

beforeEach(() => {
  vi.clearAllMocks();
});

const renderHeader = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Header />
    </MemoryRouter>
  );

describe('Header — busca com filtro de estoque', () => {
  it('deve incluir .gt("stock", 0) na query de sugestões', async () => {
    renderHeader();

    // Encontra o input de busca
    const input = screen.getByPlaceholderText('Buscar varas, anzóis, iscas, linhas...');
    expect(input).toBeTruthy();

    // Digita algo para disparar a busca (dispara o debounce)
    fireEvent.change(input, { target: { value: 'alicate' } });

    // Aguarda o debounce (250ms) + promise
    await waitFor(() => {
      expect(mockSupabaseQuery.select).toHaveBeenCalled();
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('pdv_only', false);
      expect(mockSupabaseQuery.gt).toHaveBeenCalledWith('stock', 0);
      expect(mockSupabaseQuery.ilike).toHaveBeenCalledWith('name', '%alicate%');
      expect(mockSupabaseQuery.limit).toHaveBeenCalledWith(6);
    });
  });
});
