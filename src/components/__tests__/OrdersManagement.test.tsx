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
    {
      id: 'order-5',
      total_amount: 18.00,
      shipping_cost: 0,
      status: 'cancelado',
      created_at: new Date(Date.now() - 345600000).toISOString(),
      user_id: 'user-3',
      shipping_cep: '12345678',
      delivery_type: 'pickup',
      source: 'site',
      payment_gateway: 'asaas',
      payment_id: 'pay-refunded',
      asaas_payment_id: 'pay-refunded',
      payment_method: 'credit_card',
      order_items: [
        { id: 'item-5', quantity: 1, price_at_purchase: 18.00, product_id: 'prod-5', products: { name: 'Anzol Simples' } },
      ],
      nfe_emissions: [],
      refunded_amount: 18.00,
    },
  ];

  const mockRefunds: any[] = [
    { order_id: 'order-5', amount: 18.00, status: 'approved' },
  ];

  function buildChain(result: any) {
    const chain: any = {
      select: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
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
      { id: 'user-3', full_name: 'Ana Refund', cpf: '11122233344' },
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
import { classifyCancelledOrder, getCancellationReasonConfig, getGatewayUrl } from '@/lib/orderStatus';
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
      expect(screen.getAllByText(/joão silva/i).length).toBeGreaterThanOrEqual(1);
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
      expect(screen.getAllByText(/joão silva/i).length).toBeGreaterThanOrEqual(1);
    });
    const cancelButtons = screen.getAllByText('Cancelar Pedido');
    expect(cancelButtons.length).toBeGreaterThanOrEqual(1);
  });

  // ── Verifica que o componente compila com novos diálogos ──

  it('componente renderiza sem crash com todas as abas (retirada)', async () => {
    render(
      <MemoryRouter>
        <OrdersManagement />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getAllByText(/joão silva/i).length).toBeGreaterThanOrEqual(1);
    });

    // Verifica abas do fluxo Retirada (default)
    expect(screen.getByText('Sem Pagamento')).toBeDefined();
    expect(screen.getByText('Em Preparação')).toBeDefined();
    expect(screen.getByText('Retirados')).toBeDefined();
    expect(screen.getByText('Devoluções')).toBeDefined();
    expect(screen.getByText('Cancelados')).toBeDefined();
  });

  it('componente renderiza abas do fluxo entrega', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <OrdersManagement />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getAllByText(/joão silva/i).length).toBeGreaterThanOrEqual(1);
    });

    // Clica no botão "Entrega" do segmented control
    const entregaBtn = screen.getByRole('button', { name: /entrega/i });
    await user.click(entregaBtn);

    await waitFor(() => {
      expect(screen.getByText('Envio')).toBeDefined();
      expect(screen.getByText('Em Transporte')).toBeDefined();
      expect(screen.getByText('Entregues')).toBeDefined();
    });
  });

  // ── Verifica que a interface Order aceita os novos campos ──

  it('exibe informações de pagamento no resumo do pedido (card)', async () => {
    render(
      <MemoryRouter>
        <OrdersManagement />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getAllByText(/joão silva/i).length).toBeGreaterThanOrEqual(1);
    });

    // O pedido order-1 deve mostrar o tipo "Retirada" (delivery_type pickup)
    expect(screen.getAllByText('Retirada').length).toBeGreaterThanOrEqual(1);
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
      expect(screen.getAllByText(/joão silva/i).length).toBeGreaterThanOrEqual(1);
    });

    // Clica no botão "Entrega" do segmented control
    const entregaBtn = screen.getByRole('button', { name: /entrega/i });
    await user.click(entregaBtn);

    // Clica na aba "Entregues"
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
      expect(screen.getAllByText(/joão silva/i).length).toBeGreaterThanOrEqual(1);
    });

    // No fluxo Retirada (default), clica na aba "Retirados" para pedidos retirados (pickup)
    const retiradosTab = screen.getByRole('tab', { name: /retirados/i });
    await user.click(retiradosTab);

    await waitFor(() => {
      // 2 pedidos retirados (order-3, order-4) estão em "Retirados"
      const confirmButtons = screen.getAllByText('Confirmar Devolução');
      expect(confirmButtons.length).toBe(2);
    });

    // Agora no fluxo Entrega, clica em "Entregues" para ver o pedido entregado (delivery)
    const entregaBtn = screen.getByRole('button', { name: /entrega/i });
    await user.click(entregaBtn);

    const entreguesTab = screen.getByRole('tab', { name: /entregues/i });
    await user.click(entreguesTab);

    await waitFor(() => {
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
      expect(screen.getAllByText(/joão silva/i).length).toBeGreaterThanOrEqual(1);
    });

    // Clica na aba "Retirados" (fluxo Retirada default)
    const retiradosTab = screen.getByRole('tab', { name: /retirados/i });
    await user.click(retiradosTab);

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
      expect(screen.getAllByText(/Asaas/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('pedido totalmente reembolsado mostra link para comprovante em vez de botão de estorno', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <OrdersManagement />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/gestão de pedidos/i)).toBeDefined();
    });

    // Navega para a aba Cancelados — mostra todos por padrão
    const canceladosTab = screen.getByRole('tab', { name: /cancelados/i });
    await user.click(canceladosTab);

    await waitFor(() => {
      expect(screen.getAllByText(/ana refund/i).length).toBeGreaterThanOrEqual(1);
    });

    // O pedido com refunded_amount=18 deve mostrar "Comprovante no Asaas" em vez de "Estornar dinheiro"
    expect(screen.getByText(/comprovante no asaas/i)).toBeDefined();
  });

  it('diálogo de devolução para retirada sem pagamento NÃO inclui opção de estorno', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <OrdersManagement />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getAllByText(/joão silva/i).length).toBeGreaterThanOrEqual(1);
    });

    // Clica na aba "Retirados" (fluxo Retirada default)
    const retiradosTab = screen.getByRole('tab', { name: /retirados/i });
    await user.click(retiradosTab);

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

describe('CancelledOrdersView — sub-tabs', () => {
  const needsRefundOrder = {
    id: '11111111-1111-1111-1111-111111111111',
    total_amount: 100,
    shipping_cost: 0,
    status: 'cancelado' as const,
    created_at: '2026-07-28T14:30:00Z',
    user_id: 'user-1',
    shipping_cep: '01001-000',
    delivery_type: 'delivery' as const,
    payment_gateway: 'asaas',
    payment_id: 'pay_123',
    payment_method: 'credit_card',
    card_brand: 'Visa',
    card_last_digits: '1234',
    refunded_amount: 0,
    cancellation_reason: 'cancelado_admin',
    order_items: [{ id: 'item-1', quantity: 1, price_at_purchase: 100, product_id: 'prod-1', products: { name: 'Vara de Pesca' } }],
  };

  const noPaymentOrder = {
    id: '22222222-2222-2222-2222-222222222222',
    total_amount: 50,
    shipping_cost: 0,
    status: 'cancelado' as const,
    created_at: '2026-07-27T09:15:00Z',
    user_id: 'user-1',
    shipping_cep: '01001-000',
    delivery_type: 'delivery' as const,
    payment_gateway: null,
    payment_id: null,
    payment_method: null,
    refunded_amount: 0,
    cancellation_reason: 'prazo_expirado',
    order_items: [{ id: 'item-2', quantity: 2, price_at_purchase: 25, product_id: 'prod-2', products: { name: 'Anzol' } }],
  };

  it('classifyCancelledOrder classifies orders correctly', () => {
    expect(classifyCancelledOrder(needsRefundOrder)).toBe('needs_refund');
    expect(classifyCancelledOrder(noPaymentOrder)).toBe('no_payment');
  });
});

describe('CancelledOrderCard', () => {
  it('getCancellationReasonConfig returns correct label and color', () => {
    const reasonCfg = getCancellationReasonConfig('cancelado_admin');
    expect(reasonCfg.label).toBe('Cancelado pela loja');
    expect(reasonCfg.color).toBe('blue');
  });

  it('getGatewayUrl generates Asaas sandbox URL for payment', () => {
    const url = getGatewayUrl('asaas', 'pay_123');
    expect(url).toContain('pay_123');
    expect(url).toContain('asaas.com');
  });

  it('getGatewayUrl returns null for missing gateway', () => {
    expect(getGatewayUrl(null, 'pay_123')).toBeNull();
    expect(getGatewayUrl('asaas', null)).toBeNull();
  });
});

describe('CancelledOrdersView — integration', () => {
  const mockOrders = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      total_amount: 100,
      shipping_cost: 0,
      status: 'cancelado' as const,
      created_at: '2026-07-28T14:30:00Z',
      user_id: 'user-1',
      shipping_cep: '01001-000',
      delivery_type: 'delivery' as const,
      payment_gateway: 'asaas',
      payment_id: 'pay_123',
      payment_method: 'credit_card',
      card_brand: 'Visa',
      card_last_digits: '1234',
      refunded_amount: 0,
      cancellation_reason: 'cancelado_admin',
      order_items: [{ id: 'item-1', quantity: 1, price_at_purchase: 100, product_id: 'prod-1', products: { name: 'Vara de Pesca' } }],
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      total_amount: 50,
      shipping_cost: 0,
      status: 'cancelado' as const,
      created_at: '2026-07-27T09:15:00Z',
      user_id: 'user-1',
      shipping_cep: '01001-000',
      delivery_type: 'delivery' as const,
      payment_gateway: null,
      payment_id: null,
      payment_method: 'pix',
      card_brand: null,
      card_last_digits: null,
      refunded_amount: 0,
      cancellation_reason: 'prazo_expirado',
      order_items: [{ id: 'item-2', quantity: 2, price_at_purchase: 25, product_id: 'prod-2', products: { name: 'Anzol' } }],
    },
  ];

  const mockProfiles = {
    'user-1': { name: 'João Silva', cpf: '123.456.789-00' },
  };

  it('classifies orders into correct categories', () => {
    const needsRefund = mockOrders.filter(o => classifyCancelledOrder(o) === 'needs_refund');
    const noPayment = mockOrders.filter(o => classifyCancelledOrder(o) === 'no_payment');

    expect(needsRefund).toHaveLength(1);
    expect(needsRefund[0].id).toBe('11111111-1111-1111-1111-111111111111');
    expect(noPayment).toHaveLength(1);
    expect(noPayment[0].id).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('generates correct gateway link for Asaas', () => {
    const url = getGatewayUrl('asaas', 'pay_123');
    expect(url).toContain('pay_123');
  });

  it('returns null gateway link when no payment_id', () => {
    const url = getGatewayUrl('mercadopago', null);
    expect(url).toBeNull();
  });
});
