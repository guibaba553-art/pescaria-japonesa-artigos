import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

// ─── Mocks ────────────────────────────────────────────────
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { stock: 10 }, error: null }) })),
      })),
    })),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useCart', () => ({
  useCart: () => ({
    items: [
      { cartItemKey: 'p1', id: 'p1', name: 'Produto 1', price: 50, quantity: 1, image_url: null },
    ],
    addItem: vi.fn(),
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
    clearCart: vi.fn(),
    total: 50,
    itemCount: 1,
    lastAddedKey: null,
    clearLastAdded: vi.fn(),
  }),
}));

import { Cart } from '../Cart';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Cart — navegação para checkout', () => {
  it('deve navegar para /checkout ao clicar em Finalizar compra', () => {
    render(
      <MemoryRouter>
        <Cart open={true} onOpenChange={vi.fn()} hideTrigger />
      </MemoryRouter>
    );

    const btn = screen.getByText('Finalizar compra');
    fireEvent.click(btn);

    expect(mockNavigate).toHaveBeenCalledWith('/checkout');
  });
});
