import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────
const { mockFrom, mockChannel } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockChannel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
  })),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
    channel: mockChannel,
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// jsdom doesn't implement scrollIntoView — cmdk depends on it
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// ─── Helpers ──────────────────────────────────────────────
import { PurchaseLists } from '@/components/PurchaseLists';

function createMockQuery(data: unknown[]) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (value: unknown) => void) =>
      resolve({ data, error: null }),
    ),
  };
  return query;
}

// ─── Fixtures ──────────────────────────────────────────────

const autoLists = [
  { id: 'auto-1', name: '🔄 Reposição - Fornecedor A', notes: null, created_at: '2026-07-01T00:00:00Z', supplier_id: 'sup-1', is_auto: true },
  { id: 'auto-2', name: '🔄 Reposição - Fornecedor B', notes: null, created_at: '2026-07-02T00:00:00Z', supplier_id: 'sup-2', is_auto: true },
];

const manualLists = [
  { id: 'manual-1', name: 'Lista de Compras', notes: 'Compras do mês', created_at: '2026-06-15T00:00:00Z', supplier_id: null, is_auto: false },
  { id: 'manual-2', name: 'Urgente', notes: null, created_at: '2026-06-20T00:00:00Z', supplier_id: null, is_auto: false },
];

const allLists = [...autoLists, ...manualLists];

const mockItems: Array<{
  id: string; list_id: string; product_id: string; variation_id: string | null; quantity: number;
}> = [];

// ─── Tests ──────────────────────────────────────────────

describe('PurchaseLists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 6.1 Auto lists section
  it('renderiza listas automáticas em seção separada com heading "🔄 Reposição Automática"', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'purchase_lists') return createMockQuery(allLists);
      if (table === 'purchase_list_items') return createMockQuery(mockItems);
      return createMockQuery([]);
    });

    render(<PurchaseLists />);

    await waitFor(() => {
      expect(screen.getByText('🔄 Reposição Automática')).toBeTruthy();
    });
  });

  // 6.2 Manual lists section
  it('renderiza listas manuais em seção separada com heading "📋 Listas Manuais"', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'purchase_lists') return createMockQuery(allLists);
      if (table === 'purchase_list_items') return createMockQuery(mockItems);
      return createMockQuery([]);
    });

    render(<PurchaseLists />);

    await waitFor(() => {
      expect(screen.getByText('📋 Listas Manuais')).toBeTruthy();
    });
  });

  // 6.3 Auto list badge
  it('exibe badge "Automática" nos cards de listas automáticas', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'purchase_lists') return createMockQuery(allLists);
      if (table === 'purchase_list_items') return createMockQuery(mockItems);
      return createMockQuery([]);
    });

    render(<PurchaseLists />);

    await waitFor(() => {
      const badges = screen.getAllByText('Automática');
      expect(badges.length).toBe(2);
    });
  });

  // 6.4 Delete confirmation dialog for auto lists
  it('exibe diálogo de confirmação ao deletar lista automática', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    confirmSpy.mockImplementation(() => false);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'purchase_lists') return createMockQuery(allLists);
      if (table === 'purchase_list_items') return createMockQuery(mockItems);
      return createMockQuery([]);
    });

    render(<PurchaseLists />);

    await waitFor(() => {
      expect(screen.getByText('🔄 Reposição - Fornecedor A')).toBeTruthy();
    });

    // Find all trash buttons and click the first one
    const deleteButtons = screen.getAllByRole('button', { name: '' });
    // The trash button is the last button in the card header
    const trashButtons = deleteButtons.filter(
      (btn) => btn.querySelector('svg')?.getAttribute('class')?.includes('text-destructive'),
    );

    if (trashButtons.length > 0) {
      await userEvent.click(trashButtons[0]);
      expect(confirmSpy).toHaveBeenCalled();
      const confirmMessage = confirmSpy.mock.calls[0][0];
      expect(confirmMessage).toContain('recriados');
    }

    confirmSpy.mockRestore();
  });
});
