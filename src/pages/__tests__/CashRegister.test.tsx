import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CashRegister from '../CashRegister';

const { rpc, toast, state } = vi.hoisted(() => ({
  rpc: vi.fn(), toast: vi.fn(),
  state: { current_denominations: { '20': 1 } as Record<string, number> },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({
  user: { id: 'operator' }, isAdmin: true, permissions: {}, loading: false,
}) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/components/Header', () => ({ Header: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc,
  from: (table: string) => {
    let closed = false;
    const query: any = {
      select: () => query, order: () => query, limit: () => query,
      gte: () => query, in: () => query,
      eq: (key: string, value: string) => { if (key === 'status' && value === 'closed') closed = true; return query; },
      maybeSingle: async () => ({ data: closed ? null : {
        id: 'register', status: 'open', opened_at: '2026-10-17T08:00:00Z',
        opening_amount: 20, current_denominations: state.current_denominations,
      }, error: null }),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return query;
  },
} }));

describe('reforço do caixa por cédulas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.current_denominations = { '20': 1 };
    rpc.mockImplementation(async (_name, args) => {
      state.current_denominations = { '20': 1, ...args.p_denominations };
      return { data: { amount: 100.5 }, error: null };
    });
  });

  it('registra 2 notas de 50 e 1 moeda de 0,50 como R$ 100,50 e recarrega o saldo', async () => {
    render(<MemoryRouter><CashRegister /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Nova Reforço' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantidade de R$ 50' }), { target: { value: '2' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantidade de R$ 0,50' }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Reforço' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('register_cash_reinforcement', {
      p_cash_register_id: 'register', p_denominations: { '50': 2, '0.5': 1 }, p_reason: '',
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('tab', { name: 'Cédulas' }));
    await waitFor(() => expect(screen.getByText('R$ 100,00')).toBeInTheDocument());
  });

  it('não permite confirmar reforço vazio', async () => {
    render(<MemoryRouter><CashRegister /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Nova Reforço' }));
    expect(screen.getByRole('button', { name: 'Confirmar Reforço' })).toBeDisabled();
    expect(rpc).not.toHaveBeenCalled();
  });
});