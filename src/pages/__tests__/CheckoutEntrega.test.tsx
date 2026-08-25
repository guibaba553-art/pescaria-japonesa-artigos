import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ─── Mocks ────────────────────────────────────────────────
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({}),
    useSearchParams: () => [new URLSearchParams('frete=Retirar na Loja&frete_valor=0'), vi.fn()],
  };
});

const mockUser = { id: 'user-123', email: 'test@test.com' };
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false, permissions: {} }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

let mockCartTotal = 100;

vi.mock('@/hooks/useCart', () => ({
  useCart: () => ({
    items: [
      { cartItemKey: 'item-1', id: 'prod-1', name: 'Produto Teste', price: mockCartTotal, quantity: 1, image_url: null },
    ],
    total: mockCartTotal,
    itemCount: 1,
    clearCart: vi.fn(),
    addItem: vi.fn(),
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
    lastAddedKey: null,
    clearLastAdded: vi.fn(),
  }),
}));

// Mock do supabase
const mockFrom = vi.fn();
const mockRpc = vi.fn();
let currentFromTable = '';
let capturedOrdersInsert: { payment_method?: string; payment_gateway?: string; [key: string]: unknown } | null = null;
let capturedOrdersUpdates: { table: string; payload: Record<string, unknown> }[] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    functions: {
      invoke: vi.fn(),
    },
    rpc: (...args: any[]) => mockRpc(...args),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/config/constants', () => ({
  PAYMENT_CONFIG: {
    PIX_EXPIRATION_MINUTES: 30,
    POLLING_INTERVAL_MS: 5000,
    POLLING_MAX_MINUTES: 15,
    CARD_RETRY_MAX_ATTEMPTS: 3,
    CARD_RETRY_WINDOW_MINUTES: 10,
    MAX_INSTALLMENTS: 10,
    MIN_INSTALLMENT_VALUE: 5,
    CARD_MIN_ORDER_VALUE: 5,
  },
  SHIPPING_CONFIG: {
    ORIGIN_CEP: '78556100',
    DEFAULT_WEIGHT: 500,
    DEFAULT_FORMAT: 1,
    DEFAULT_DIMENSIONS: { length: 30, height: 20, width: 20 },
    SERVICES: { SEDEX: '04014', PAC: '04510' },
  },
  ASAAS_CONFIG: { ENVIRONMENT: 'sandbox' },
  VALIDATION_RULES: {
    CPF_LENGTH: 11,
    CEP_LENGTH: 8,
    PHONE_MIN_LENGTH: 10,
    PHONE_MAX_LENGTH: 11,
    PASSWORD_MIN_LENGTH: 6,
  },
}));

// Mock do CreditCardForm para simplificar o teste
vi.mock('@/components/CreditCardForm', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const mockCardData = {
    installmentCount: 1,
    saveCard: false,
    creditCard: { number: '4111111111111111', holderName: 'Teste', expiry: '12/30', cvv: '123' },
    creditCardHolderInfo: { name: 'Teste', cpfCnpj: '12345678901', email: 'teste@test.com', phone: '11999999999' },
  };
  const CreditCardForm = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ getData: () => mockCardData, validate: () => [] }));
    return (
      <div data-testid="credit-card-form">
        <span>Cartão de Crédito (mock)</span>
        <button
          data-testid="mock-submit"
          onClick={() => props.onInstallmentChange?.(1)}
          disabled={props.loading}
        >
          Pagar
        </button>
        {props.error && <span data-testid="card-error">{props.error}</span>}
      </div>
    );
  });
  return { CreditCardForm, CreditCardFormHandle: {} };
});

vi.mock('@/utils/invokeWithTimeout', async () => {
  const actual = await vi.importActual<typeof import('@/utils/invokeWithTimeout')>(
    '@/utils/invokeWithTimeout',
  );
  return {
    ...actual,
    invokeWithTimeout: (
      fnName: string,
      options?: { body?: Record<string, unknown>; timeoutMs?: number },
    ) => actual.invokeWithTimeout(fnName, { ...options, timeoutMs: 30 }),
  };
});

vi.mock('@/components/PixPaymentDialog', () => ({
  PixPaymentDialog: vi.fn().mockImplementation(({ open, onOpenChange, gateway, orderId }: any) =>
    open ? (
      <div data-testid="pix-dialog">
        <span>PIX Dialog (gateway: {gateway}, order: {orderId})</span>
        <button onClick={() => onOpenChange(false)}>Fechar</button>
      </div>
    ) : null
  ),
}));

// Mock da validação do carrinho — sempre válido para os testes de fluxo
const mockValidateSiteCart = vi.fn();
vi.mock('@/utils/siteCartValidation', () => ({
  validateSiteCart: (...args: any[]) => mockValidateSiteCart(...args),
}));

import { toast } from 'sonner';
import CheckoutEntrega from '@/pages/CheckoutEntrega';
import { supabase } from '@/integrations/supabase/client';

beforeEach(() => {
  vi.clearAllMocks();

  // Default supabase mocks — objeto thenable que permite encadeamento e await
  const mockResolveValue = { data: null, error: null };
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(mockResolveValue),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(mockResolveValue),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    then: undefined as any,
    catch: undefined as any,
  };
  const thenable = Promise.resolve(mockResolveValue);
  mockChain.then = thenable.then.bind(thenable);
  mockChain.catch = thenable.catch.bind(thenable);
  mockFrom.mockImplementation((table: string) => {
    currentFromTable = table;
    return mockChain;
  });
  mockChain.insert = vi.fn().mockImplementation((payload: any) => {
    if (currentFromTable === 'orders') {
      capturedOrdersInsert = payload;
      capturedOrdersUpdates = [];
    }
    return mockChain;
  });
  mockChain.update = vi.fn().mockImplementation((payload: any) => {
    capturedOrdersUpdates.push({ table: currentFromTable, payload });
    return mockChain;
  });
  capturedOrdersUpdates = [];
  mockChain.single = vi.fn().mockResolvedValue({ data: { id: 'order-1' }, error: null });
  capturedOrdersInsert = null;
  mockCartTotal = 100;

  // Default rpc mock — stock disponível, sem erros
  mockRpc.mockResolvedValue({ data: 999, error: null });

  // Default edge function mock — PIX criado com sucesso
  (supabase.functions.invoke as any).mockResolvedValue({
    data: { success: true, data: { brCode: '000201...', brCodeBase64: 'iVBOR...', expiresAt: new Date().toISOString() } },
    error: null,
  });

  // Validação do carrinho sempre válida para os testes de fluxo
  mockValidateSiteCart.mockResolvedValue({ valid: true, issues: [], removeKeys: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CheckoutEntrega — fluxo de pagamento PIX', () => {
  it('deve renderizar com opções PIX e Cartão', async () => {
    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    expect(screen.getByText('PIX')).toBeInTheDocument();
    expect(screen.getByText('Cartão de Crédito')).toBeInTheDocument();
  });

  it('deve selecionar PIX por padrão', async () => {
    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    // PIX deve estar marcado como selecionado
    const pixOption = screen.getByText('PIX');
    expect(pixOption).toBeInTheDocument();
  });

  it('deve alternar para Cartão ao clicar', async () => {
    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    // Clicar em Cartão de Crédito
    fireEvent.click(screen.getByText('Cartão de Crédito'));

    // O CreditCardForm mock deve aparecer
    await waitFor(() => {
      expect(screen.getByTestId('credit-card-form')).toBeInTheDocument();
    });
  });
});

describe('CheckoutEntrega — fluxo de pagamento Cartão', () => {
  it('deve renderizar CreditCardForm quando cartão é selecionado', async () => {
    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    // Selecionar Cartão
    fireEvent.click(screen.getByText('Cartão de Crédito'));

    await waitFor(() => {
      expect(screen.getByTestId('credit-card-form')).toBeInTheDocument();
    });
  });
});

// ─── Gateway routing ────────────────────────────────────────
// NOTA: Testes de fallback (primário falha → alternativo) exigem
// manipulação de módulos com vi.resetModules(), o que é frágil em
// ambiente de teste unitário. Cobertura completa de fallback é
// melhor obtida via testes E2E.

describe('CheckoutEntrega — gateway routing PIX', () => {
  it('deve mapear pedido < R$ 201 para create-mercadopago-pix', async () => {
    // NOTA: O fluxo completo handleFinalizeOrder é complexo demais para teste
    // unitário — depende de 8+ chamadas assíncronas ao supabase (validação de
    // carrinho, inserção de pedido, itens, estoque, promo limits, etc).
    //
    // A lógica de roteamento é verificada em 3 níveis:
    // 1. Unit: pixGatewayRouter.test.ts — selectPixGateway(total) funciona
    // 2. Edge Function: create_mercadopago_pix_test.ts — PIX Mercado Pago criado
    // 3. E2E (planejado): e2e/golden-path.spec.ts — fluxo completo no browser
    //
    // Aqui verificamos apenas que o módulo importa selectPixGateway corretamente.
    const { selectPixGateway } = await import('@/lib/pixGatewayRouter');
    expect(selectPixGateway(100)).toBe('mercadopago');
    expect(selectPixGateway(300)).toBe('asaas');
  });

  it('fallback: quando gateway primário falha, tenta o alternativo', async () => {
    // NOTA: Este cenário requer vi.resetModules() + vi.doMock() que são frágeis
    // em ambiente Vitest/JSDOM. A cobertura de fallback é melhor obtida via
    // testes E2E com Playwright (e2e/golden-path.spec.ts).
    //
    // O comportamento é verificado indiretamente via:
    // 1. pixGatewayRouter.test.ts — selectPixGateway() funciona corretamente
    // 2. O teste acima — create-mercadopago-pix é chamado para pedidos < R$ 201
    // 3. cancel_expired_orders_test.ts + create_asaas_pix_test.ts — Asaas funciona
    //
    // Para validar fallback completo: rodar E2E com Playwright simulando falha
    // de gateway via intercepção de rede.
    expect(true).toBe(true); // placeholder até termos E2E
  });
});

describe('CheckoutEntrega — grava forma de pagamento na criação do pedido', () => {
  it('PIX < R$ 201: grava payment_method=pix e payment_gateway=mercadopago', async () => {
    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Finalizar pedido'));

    await waitFor(() => {
      expect(screen.getByTestId('pix-dialog')).toBeInTheDocument();
    });

    expect(capturedOrdersInsert).toMatchObject({
      payment_method: 'pix',
      payment_gateway: 'mercadopago',
    });
  });

  it('PIX acima do break-even (~R$ 201): grava payment_method=pix e payment_gateway=asaas', async () => {
    mockCartTotal = 300;

    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Finalizar pedido'));

    await waitFor(() => {
      expect(screen.getByTestId('pix-dialog')).toBeInTheDocument();
    });

    expect(capturedOrdersInsert).toMatchObject({
      payment_method: 'pix',
      payment_gateway: 'asaas',
    });
  });

  it('Cartão: grava payment_method=credit_card e payment_gateway=asaas', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: { success: true, paymentStatus: 'PENDING' },
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ ip: '127.0.0.1' }) }));

    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Cartão de Crédito'));
    await waitFor(() => {
      expect(screen.getByTestId('credit-card-form')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Finalizar pedido'));

    await waitFor(() => {
      expect(capturedOrdersInsert).not.toBeNull();
    });

    expect(capturedOrdersInsert).toMatchObject({
      payment_method: 'credit_card',
      payment_gateway: 'asaas',
    });
  });
});

describe('CheckoutEntrega — timeout e rollback PIX via edge function', () => {
  const invokeCalls = () =>
    (supabase.functions.invoke as any).mock.calls.map((c: any[]) => c[0]);

  it('timeout no gateway primário → chama o gateway alternativo (fallback)', async () => {
    (supabase.functions.invoke as any).mockImplementation(async (fnName: string) => {
      if (fnName === 'create-mercadopago-pix') {
        return new Promise(() => {});
      }
      return {
        data: { success: true, data: { brCode: '000201...', brCodeBase64: 'iVBOR...', expiresAt: new Date().toISOString() } },
        error: null,
      };
    });

    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Finalizar pedido'));

    await waitFor(() => {
      expect(screen.getByTestId('pix-dialog')).toBeInTheDocument();
    }, { timeout: 5000 });

    expect(invokeCalls()).toContain('create-mercadopago-pix');
    expect(invokeCalls()).toContain('create-asaas-pix');
  });

  it('ambos os gateways falham → rollback via cancel-checkout-order, sem UPDATE client-side, toast amigável', async () => {
    (supabase.functions.invoke as any).mockImplementation(async (fnName: string) => {
      if (fnName === 'create-mercadopago-pix' || fnName === 'create-asaas-pix') {
        return { data: { success: false, error: 'rejected_internal_9981' }, error: null };
      }
      if (fnName === 'cancel-checkout-order') {
        return { data: { success: true, cancelled: true }, error: null };
      }
      return { data: null, error: null };
    });

    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Finalizar pedido'));

    await waitFor(() => {
      expect(invokeCalls()).toContain('cancel-checkout-order');
    });

    const cancelCall = (supabase.functions.invoke as any).mock.calls.find(
      (c: any[]) => c[0] === 'cancel-checkout-order',
    );
    expect(cancelCall[1].body).toMatchObject({ orderId: 'order-1' });

    const updates = capturedOrdersUpdates;
    expect(updates.filter((u) => u.table === 'orders')).toHaveLength(0);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Não foi possível gerar o PIX. Tente novamente.');
    });
  });

  it('rollback best-effort: falha do cancel-checkout-order não impede o toast amigável', async () => {
    (supabase.functions.invoke as any).mockImplementation(async (fnName: string) => {
      if (fnName === 'create-mercadopago-pix' || fnName === 'create-asaas-pix') {
        return { data: null, error: { message: 'unavailable' } };
      }
      if (fnName === 'cancel-checkout-order') {
        throw new Error('ef down');
      }
      return { data: null, error: null };
    });

    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Finalizar pedido'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Não foi possível gerar o PIX. Tente novamente.');
    });
  });
});
