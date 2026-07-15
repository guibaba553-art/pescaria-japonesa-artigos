import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ─── Hoisted mocks (avoids hoisting issues with vi.mock) ──
const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// jsdom doesn't implement scrollIntoView — cmdk depends on it
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// ─── Import after mocks ───────────────────────────────────
import { SupplierSelect } from '@/components/SupplierSelect';

// ─── Helpers ──────────────────────────────────────────────
function createMockQuery(data: unknown[]) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (value: unknown) => void) =>
      resolve({ data, error: null }),
    ),
  };
  return query;
}

const mockSuppliers = [
  { id: 'sup-1', nome_fantasia: 'Fornecedor A', razao_social: 'Razão A Ltda' },
  { id: 'sup-2', nome_fantasia: null, razao_social: 'Razão B Ltda' },
  { id: 'sup-3', nome_fantasia: 'Fornecedor C', razao_social: 'Razão C Ltda' },
];

// ─── Tests ────────────────────────────────────────────────
describe('SupplierSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders combobox with placeholder "Buscar fornecedor..."', () => {
    mockFrom.mockReturnValue(createMockQuery(mockSuppliers));
    render(<SupplierSelect value="" onChange={vi.fn()} />);

    expect(screen.getByText('Buscar fornecedor...')).toBeTruthy();
  });

  it('loads and displays active suppliers from Supabase', async () => {
    mockFrom.mockReturnValue(createMockQuery(mockSuppliers));
    render(<SupplierSelect value="" onChange={vi.fn()} />);

    // Open the popover
    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);

    // All three suppliers should appear
    await waitFor(() => {
      expect(screen.getByText('Fornecedor A')).toBeTruthy();
    });
    expect(screen.getByText('Razão B Ltda')).toBeTruthy();
    expect(screen.getByText('Fornecedor C')).toBeTruthy();
  });

  it('displays nome_fantasia when set, falls back to razao_social when null', async () => {
    mockFrom.mockReturnValue(createMockQuery(mockSuppliers));
    render(<SupplierSelect value="" onChange={vi.fn()} />);

    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);

    await waitFor(() => {
      // supplier with nome_fantasia should show it
      expect(screen.getByText('Fornecedor A')).toBeTruthy();
      // supplier without nome_fantasia should show razao_social
      expect(screen.getByText('Razão B Ltda')).toBeTruthy();
    });
  });

  it('filters suppliers when typing in search', async () => {
    mockFrom.mockReturnValue(createMockQuery(mockSuppliers));
    render(<SupplierSelect value="" onChange={vi.fn()} />);

    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);

    const input = screen.getByPlaceholderText('Buscar fornecedor...');
    await userEvent.type(input, 'Fornecedor');

    await waitFor(() => {
      // Only suppliers with "Fornecedor" in their display name should show
      expect(screen.getByText('Fornecedor A')).toBeTruthy();
      expect(screen.getByText('Fornecedor C')).toBeTruthy();
    });
    // "Razão B Ltda" doesn't match "Fornecedor"
    expect(screen.queryByText('Razão B Ltda')).toBeNull();
  });

  it('excludes inactive suppliers (only is_active=true returned)', () => {
    mockFrom.mockReturnValue(createMockQuery(mockSuppliers));
    render(<SupplierSelect value="" onChange={vi.fn()} />);

    // The query chain must include .eq('is_active', true)
    expect(mockFrom).toHaveBeenCalledWith('suppliers');

    const query = mockFrom.mock.results[0]!.value;
    expect(query.select).toHaveBeenCalledWith('id, nome_fantasia, razao_social');
    expect(query.eq).toHaveBeenCalledWith('is_active', true);
    expect(query.order).toHaveBeenCalledWith('razao_social');
  });

  it('calls onChange with the selected supplier ID', async () => {
    mockFrom.mockReturnValue(createMockQuery(mockSuppliers));
    const onChange = vi.fn();
    render(<SupplierSelect value="" onChange={onChange} />);

    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText('Fornecedor A')).toBeTruthy();
    });

    await userEvent.click(screen.getByText('Fornecedor A'));

    expect(onChange).toHaveBeenCalledWith('sup-1');
  });
});
