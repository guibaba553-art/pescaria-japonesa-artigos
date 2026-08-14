import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ─── Mocks ────────────────────────────────────────────────
const mockSupabaseQuery: any = {
  select: vi.fn(() => mockSupabaseQuery),
  eq: vi.fn(() => mockSupabaseQuery),
  gt: vi.fn(() => mockSupabaseQuery),
  ilike: vi.fn(() => mockSupabaseQuery),
  or: vi.fn(() => mockSupabaseQuery),
  order: vi.fn(() => mockSupabaseQuery),
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

describe('Header — busca tolerante', () => {
  it('filtra por estoque e busca em vários campos', async () => {
    renderHeader();

    const input = screen.getByPlaceholderText('Buscar varas, anzóis, iscas, linhas...');
    expect(input).toBeTruthy();

    fireEvent.change(input, { target: { value: 'alicate' } });

    await waitFor(() => {
      expect(mockSupabaseQuery.select).toHaveBeenCalled();
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('pdv_only', false);
      expect(mockSupabaseQuery.gt).toHaveBeenCalledWith('stock', 0);
      expect(mockSupabaseQuery.or).toHaveBeenCalledWith(
        expect.stringContaining('name.ilike.%alicate%')
      );
    });
  });

});
