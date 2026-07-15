import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (hoisted – available at module-init time) ─────

const { mockFrom, mockChannel, mockRemoveChannel, mockToast } = vi.hoisted(
  () => ({
    mockFrom: vi.fn(),
    mockChannel: vi.fn(),
    mockRemoveChannel: vi.fn(),
    mockToast: vi.fn(),
  }),
);

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ─── SUT ──────────────────────────────────────────────────

import { BrandSelect } from '@/components/BrandSelect';

// ─── Helpers ──────────────────────────────────────────────

const createMockQuery = (overrides: Record<string, any> = {}) => {
  const query: any = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
    ...overrides,
  };
  return query;
};

const createMockChannel = () => {
  const ch: any = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnValue('sub-1'),
  };
  return ch;
};

// ─── Tests ────────────────────────────────────────────────

describe('BrandSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue(createMockQuery());
    mockChannel.mockReturnValue(createMockChannel());
    mockRemoveChannel.mockImplementation(() => {});
  });

  it('renders combobox with placeholder "Selecionar marca..."', () => {
    render(<BrandSelect value="" onChange={vi.fn()} />);
    expect(screen.getByText('Selecionar marca...')).toBeDefined();
  });

  it('loads and displays brands from Supabase', async () => {
    const brands = [
      { id: '1', name: 'Shimano' },
      { id: '2', name: 'Daiwa' },
    ];
    mockFrom.mockReturnValue(
      createMockQuery({
        order: vi.fn().mockResolvedValue({ data: brands, error: null }),
      }),
    );

    render(<BrandSelect value="" onChange={vi.fn()} />);

    // Open the popover
    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText('Shimano')).toBeDefined();
      expect(screen.getByText('Daiwa')).toBeDefined();
    });
  });

  it('filters brands when typing in search', async () => {
    const brands = [
      { id: '1', name: 'Shimano' },
      { id: '2', name: 'Daiwa' },
    ];
    mockFrom.mockReturnValue(
      createMockQuery({
        order: vi.fn().mockResolvedValue({ data: brands, error: null }),
      }),
    );

    render(<BrandSelect value="" onChange={vi.fn()} />);

    // Open the popover
    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText('Shimano')).toBeDefined();
      expect(screen.getByText('Daiwa')).toBeDefined();
    });

    // Type to filter
    const searchInput = screen.getByPlaceholderText('Buscar marca...');
    await userEvent.type(searchInput, 'Shimano');

    // The matching brand should remain rendered
    await waitFor(() => {
      expect(screen.getByText('Shimano')).toBeDefined();
    });
  });

  it('opens create dialog when "+" button is clicked', async () => {
    render(<BrandSelect value="" onChange={vi.fn()} />);

    const addButton = screen.getByTitle('Nova marca');
    await userEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('Nova Marca')).toBeDefined();
      expect(screen.getByLabelText('Nome')).toBeDefined();
    });
  });

  it('creates new brand successfully', async () => {
    const onChange = vi.fn();
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'new-brand-id' },
      error: null,
    });
    mockFrom.mockReturnValue(
      createMockQuery({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: mockSingle,
      }),
    );

    render(<BrandSelect value="" onChange={onChange} />);

    // Open create dialog
    const addButton = screen.getByTitle('Nova marca');
    await userEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('Nova Marca')).toBeDefined();
    });

    // Type the brand name
    const input = screen.getByLabelText('Nome');
    await userEvent.type(input, 'Shimano');

    // Click create
    const createButton = screen.getByText('Criar e selecionar');
    await userEvent.click(createButton);

    await waitFor(() => {
      // Should have called supabase.from('brands') for insert
      expect(mockFrom).toHaveBeenCalledWith('brands');
      // Should have called onChange with the new brand ID
      expect(onChange).toHaveBeenCalledWith('new-brand-id');
    });
  });

  it('shows error toast on duplicate brand creation', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      },
    });
    mockFrom.mockReturnValue(
      createMockQuery({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: mockSingle,
      }),
    );

    render(<BrandSelect value="" onChange={vi.fn()} />);

    // Open create dialog
    const addButton = screen.getByTitle('Nova marca');
    await userEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('Nova Marca')).toBeDefined();
    });

    // Type the brand name
    const input = screen.getByLabelText('Nome');
    await userEvent.type(input, 'Shimano');

    // Click create
    const createButton = screen.getByText('Criar e selecionar');
    await userEvent.click(createButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });
  });

  it('calls onChange with the selected brand ID', async () => {
    const brands = [{ id: 'brand-1', name: 'Shimano' }];
    const onChange = vi.fn();
    mockFrom.mockReturnValue(
      createMockQuery({
        order: vi.fn().mockResolvedValue({ data: brands, error: null }),
      }),
    );

    render(<BrandSelect value="" onChange={onChange} />);

    // Open the popover
    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText('Shimano')).toBeDefined();
    });

    // Select the brand
    await userEvent.click(screen.getByText('Shimano'));

    expect(onChange).toHaveBeenCalledWith('brand-1');
  });
});
