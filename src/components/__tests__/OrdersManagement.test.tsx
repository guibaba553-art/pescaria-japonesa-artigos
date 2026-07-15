import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Use vi.hoisted so the mock factory is hoisted correctly (before imports)
const { mockSupabaseFrom } = vi.hoisted(() => {
  const mockOrders = [
    {
      id: 'order-1',
      total_amount: 149.90,
      shipping_cost: 0,
      status: 'aguardando_pagamento',
      created_at: new Date().toISOString(),
      user_id: 'user-1',
      shipping_cep: '12345678',
      delivery_type: 'pickup',
      source: 'site',
      payment_gateway: null,
      payment_id: null,
      order_items: [
        { id: 'item-1', quantity: 1, price_at_purchase: 149.90, product_id: 'prod-1', products: { name: 'Vara de Pesca' } },
      ],
      nfe_emissions: [],
      refunded_amount: 0,
    },
    {
      id: 'order-2',
      total_amount: 89.90,
      shipping_cost: 15.00,
      status: 'entregado',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      user_id: 'user-2',
      shipping_cep: '87654321',
      delivery_type: 'delivery',
      source: 'site',
      payment_gateway: null,
      payment_id: null,
      order_items: [
        { id: 'item-2', quantity: 2, price_at_purchase: 44.95, product_id: 'prod-2', products: { name: 'Anzol Pack' } },
      ],
      nfe_emissions: [],
      refunded_amount: 0,
    },
    {
      id: 'order-3',
      total_amount: 199.90,
      shipping_cost: 0,
      status: 'retirado',
      created_at: new Date(Date.now() - 172800000).toISOString(),
      user_id: 'user-1',
      shipping_cep: '12345678',
      delivery_type: 'pickup',
      source: 'site',
      payment_gateway: 'asaas',
      payment_id: 'pay-123',
      asaas_payment_id: 'pay-123',
      payment_method: 'pix',
      order_items: [
        { id: 'item-3', quantity: 1, price_at_purchase: 199.90, product_id: 'prod-3', products: { name: 'Kit Isca' } },
      ],
      nfe_emissions: [],
      refunded_amount: 0,
    },
    {
      id: 'order-4',
      total_amount: 59.90,
      shipping_cost: 0,
      status: 'retirado',
      created_at: new Date(Date.now() - 259200000).toISOString(),
      user_id: 'user-2',
      shipping_cep: '87654321',
      delivery_type: 'pickup',
      source: 'site',
      payment_gateway: null,
      payment_id: null,
      order_items: [
        { id: 'item-4', quantity: 1, price_at_purchase: 59.90, product_id: 'prod-4', products: { name: 'Linha de Pesca' } },
      ],
      nfe_emissions: [],
      refunded_amount: 0,
    },
  ];

  const mockRefunds: any[] = [];

  function buildChain(result: any) {
    const chain: any = {
      select: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      single: vi.fn(() => chain),
    };
    const promise = Promise.resolve({ data: result, error: null });
    chain.then = promise.then.bind(promise);
    chain.catch = promise.catch.bind(promise);
    return chain;
  }

  const fromFn = vi.fn((table: string) => {
    if (table === 'orders') return buildChain(mockOrders);
    if (table === 'order_items' || table === 'nfe_emissions') return buildChain([]);
    if (table === 'payment_refunds') return buildChain(mockRefunds);
    if (table === 'profiles') return buildChain([
      { id: 'user-1', full_name: 'João Silva', cpf: '12345678901' },
      { id: 'user-2', full_name: 'Maria Souza', cpf: '98765432101' },
    ]);
    return buildChain([]);
  });

  return { mockSupabaseFrom: fromFn };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'admin-1', email: 'admin@test.com' }, loading: false }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockSupabaseFrom,
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    })),
    removeChannel: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// ─── Component under test ─────────────────────────────
import { OrdersManagement } from '../OrdersManagement';

describe('OrdersManagement — fluxo de cancelamento e estorno', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não renderiza botão de excluir antigo', async () => {
    render(
      <MemoryRouter>
        <OrdersManagement />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/joão silva/i)).toBeDefined();
    });
    expect(screen.queryByText('Confirmar exclusão')).toBeNull();
  });

  it('renderiza botão Cancelar Pedido na aba sem-pagamento', async () => {
    render(
      <MemoryRouter>
        <OrdersManagement />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/joão silva/i)).toBeDefined();
    });
    const cancelButtons = screen.getAllByText('Cancelar Pedido');
    expect(cancelButtons.length).toBeGreaterThanOrEqual(1);
  });

  // ── Verifica que o componente compila com novos diálogos ──

  it('componente renderiza sem crash com todas as abas', async () => {
    render(
      <MemoryRouter>
        <OrdersManagement />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/joão silva/i)).toBeDefined();
    });

    // Verifica que todas as abas estão presentes
    expect(screen.getByText('Sem Pagamento')).toBeDefined();
    expect(screen.getByText('Em Preparação')).toBeDefined();
    expect(screen.getByText('Pronto para Retirada')).toBeDefined();
    expect(screen.getByText('Em Transporte')).toBeDefined();
    expect(screen.getByText('Entregues')).toBeDefined();
    expect(screen.getByText('Devoluções')).toBeDefined();
    expect(screen.getByText('Cancelados')).toBeDefined();
  });

  // ── Verifica que a interface Order aceita os novos campos ──

  it('exibe informações de pagamento no resumo do pedido (card)', async () => {
    render(
      <MemoryRouter>
        <OrdersManagement />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/joão silva/i)).toBeDefined();
    });

    // O pedido order-1 deve mostrar o tipo "Retirada" (delivery_type pickup)
    expect(screen.getByText('Retirada')).toBeDefined();
  });

  // ── Testes do fluxo de devolução diferenciado ──

  it('pedido entregado (delivery) exibe botão "Solicitar Devolução"', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <OrdersManagement />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/joão silva/i)).toBeDefined();
    });

    // Clica na aba "Entregues" via userEvent
    const entreguesTab = screen.getByRole('tab', { name: /entregues/i });
    await user.click(entreguesTab);

    await waitFor(() => {
      const buttons = screen.getAllByText('Solicitar Devolução');
      expect(buttons.length).toBe(1);
    });
  });

  it('pedido retirado (pickup) exibe botão "Confirmar Devolução" em vez de "Solicitar Devolução"', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <OrdersManagement />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/joão silva/i)).toBeDefined();
    });

    // Clica na aba "Entregues"
    const entreguesTab = screen.getByRole('tab', { name: /entregues/i });
    await user.click(entreguesTab);

    await waitFor(() => {
      // 2 pedidos retirados (order-3, order-4)
      const confirmButtons = screen.getAllByText('Confirmar Devolução');
      expect(confirmButtons.length).toBe(2);
      // 1 pedido entregado (order-2)
      const solicitarButtons = screen.getAllByText('Solicitar Devolução');
      expect(solicitarButtons.length).toBe(1);
    });
  });

  it('diálogo de devolução para retirada com pagamento inclui opção de estorno', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <OrdersManagement />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/joão silva/i)).toBeDefined();
    });

    // Clica na aba "Entregues"
    const entreguesTab = screen.getByRole('tab', { name: /entregues/i });
    await user.click(entreguesTab);

    // Espera os botões aparecerem
    let confirmButtons: HTMLElement[];
    await waitFor(() => {
      confirmButtons = screen.getAllByText('Confirmar Devolução');
      expect(confirmButtons.length).toBeGreaterThanOrEqual(1);
    });

    // Clica no primeiro Confirmar Devolução (order-3, com pagamento)
    await user.click(confirmButtons![0]);

    await waitFor(() => {
      expect(screen.getByText('Estornar pagamento automaticamente')).toBeDefined();
      expect(screen.getByText(/Asaas/i)).toBeDefined();
    });
  });

  it('diálogo de devolução para retirada sem pagamento NÃO inclui opção de estorno', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <OrdersManagement />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/joão silva/i)).toBeDefined();
    });

    // Clica na aba "Entregues"
    const entreguesTab = screen.getByRole('tab', { name: /entregues/i });
    await user.click(entreguesTab);

    // Espera os botões aparecerem
    let confirmButtons: HTMLElement[];
    await waitFor(() => {
      confirmButtons = screen.getAllByText('Confirmar Devolução');
      expect(confirmButtons.length).toBeGreaterThanOrEqual(2);
    });

    // Clica no segundo Confirmar Devolução (order-4, sem pagamento)
    await user.click(confirmButtons![1]);

    await waitFor(() => {
      expect(screen.queryByText('Estornar pagamento automaticamente')).toBeNull();
    });
  });
});
