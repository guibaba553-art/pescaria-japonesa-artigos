import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks de dependências ─────────────────────────────────
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock sonner toast para evitar comportamento real com fake timers
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock do supabase functions.invoke para polling
const mockInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
  },
}));

// Mock do config
vi.mock('@/config/constants', () => ({
  PAYMENT_CONFIG: {
    PIX_EXPIRATION_MINUTES: 30,
    POLLING_INTERVAL_MS: 5000,
    POLLING_MAX_MINUTES: 15,
    CARD_RETRY_MAX_ATTEMPTS: 3,
  },
}));

import { PixPaymentDialog } from '../PixPaymentDialog';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Default mock para supabase.functions.invoke — previne crash no polling inicial
  // Tests específicos sobrescrevem este mock
  mockInvoke.mockResolvedValue({ data: { status: 'pending' }, error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  qrCode: '00020126580014BR.GOV.BCB.PIX0136123',
  qrCodeBase64: 'base64encodedimage',
  orderId: 'order-123',
};

// ─── Render Tests ──────────────────────────────────────────
describe('PixPaymentDialog — renderização', () => {
  it('deve renderizar QR Code e código copia-e-cola', () => {
    render(<PixPaymentDialog {...defaultProps} />);

    expect(screen.getByText('Pagamento via PIX')).toBeInTheDocument();
    expect(screen.getByText('Copiar')).toBeInTheDocument();
    // QR Code image
    const img = screen.getByAltText('QR Code PIX');
    expect(img).toBeInTheDocument();
    // Input com o código
    const codeInput = screen.getByDisplayValue(defaultProps.qrCode);
    expect(codeInput).toBeInTheDocument();
  });

  it('deve exibir tempo de expiração quando expiresAt fornecido', () => {
    // 30 minutos no futuro
    const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    render(
      <PixPaymentDialog
        {...defaultProps}
        expiresAt={future}
      />
    );

    // O timer deve mostrar ~30 minutos
    expect(screen.getByText(/Expira em/)).toBeInTheDocument();
  });

  it('deve exibir "Expirado" quando pix_expiration já passou', () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();

    render(
      <PixPaymentDialog
        {...defaultProps}
        expiresAt={past}
      />
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('Expirado')).toBeInTheDocument();
  });

  it('deve exibir botão "Gerar novo PIX" quando expirado e onRefreshPix fornecido', () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const onRefreshPix = vi.fn();

    render(
      <PixPaymentDialog
        {...defaultProps}
        expiresAt={past}
        onRefreshPix={onRefreshPix}
      />
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('Gerar novo PIX')).toBeInTheDocument();
  });

  it('deve exibir modal de confirmação quando pagamento é aprovado', async () => {
    // Mock retorna approved
    mockInvoke.mockResolvedValue({ data: { status: 'approved' }, error: null });

    render(<PixPaymentDialog {...defaultProps} />);

    // Usar runAllTimersAsync para processar timers + microtasks corretamente
    // O checkPaymentStatus é chamado imediatamente, processa a promise,
    // atualiza isPaid=true e agenda setTimeout(2000ms) para navegar
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText('Pagamento Confirmado!')).toBeInTheDocument();
    expect(screen.getByText('Redirecionando para seus pedidos...')).toBeInTheDocument();
  });
});

// ─── Interaction Tests ─────────────────────────────────────
describe('PixPaymentDialog — interações', () => {
  it('deve copiar QR code ao clicar em Copiar', () => {
    const writeText = vi.fn();
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<PixPaymentDialog {...defaultProps} />);

    fireEvent.click(screen.getByText('Copiar'));
    expect(writeText).toHaveBeenCalledWith(defaultProps.qrCode);
  });

  it('deve chamar onRefreshPix ao clicar em "Gerar novo PIX"', () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const onRefreshPix = vi.fn();

    render(
      <PixPaymentDialog
        {...defaultProps}
        expiresAt={past}
        onRefreshPix={onRefreshPix}
      />
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    fireEvent.click(screen.getByText('Gerar novo PIX'));
    expect(onRefreshPix).toHaveBeenCalled();
  });

  it('deve navegar para /conta quando pagamento confirmado', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'approved' }, error: null });

    render(<PixPaymentDialog {...defaultProps} />);

    // Processa timers: checkPaymentStatus roda, detecta approved,
    // atualiza estado, agenda setTimeout(2000ms) para navigate
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // O setTimeout de 2000ms deve ter sido executado
    expect(mockNavigate).toHaveBeenCalledWith('/conta');
  });
});

// ─── Polling Tests ─────────────────────────────────────────
describe('PixPaymentDialog — polling', () => {
  it('deve chamar verify-payment com gateway correto', () => {
    mockInvoke.mockResolvedValue({ data: { status: 'pending' }, error: null });

    render(
      <PixPaymentDialog
        {...defaultProps}
        gateway="asaas"
      />
    );

    // Polling roda imediatamente (dentro de act)
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockInvoke).toHaveBeenCalledWith('verify-payment', {
      body: { orderId: 'order-123', gateway: 'asaas' },
    });
  });

  it('deve chamar verify-payment com mercadopago por padrão', () => {
    mockInvoke.mockResolvedValue({ data: { status: 'pending' }, error: null });

    render(<PixPaymentDialog {...defaultProps} />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockInvoke).toHaveBeenCalledWith('verify-payment', {
      body: { orderId: 'order-123', gateway: 'mercadopago' },
    });
  });

  it('deve parar de fazer polling quando componente desmonta', () => {
    mockInvoke.mockResolvedValue({ data: { status: 'pending' }, error: null });

    const { unmount } = render(<PixPaymentDialog {...defaultProps} />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const callCountBefore = mockInvoke.mock.calls.length;

    unmount();

    act(() => {
      vi.advanceTimersByTime(15000);
    });

    // Não deve ter mais chamadas depois de desmontar
    expect(mockInvoke.mock.calls.length).toBe(callCountBefore);
  });
  it('NÃO deve navegar nem mostrar toast se dialog for fechado durante verificação', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <PixPaymentDialog
        {...defaultProps}
        onOpenChange={onOpenChange}
      />
    );

    // Mock retorna approved
    mockInvoke.mockResolvedValue({ data: { status: 'approved' }, error: null });

    // Fechar o dialog
    rerender(
      <PixPaymentDialog
        {...defaultProps}
        open={false}
        onOpenChange={onOpenChange}
      />
    );

    // Processar timers — checkPaymentStatus roda, detecta approved,
    // mas como open=false, não deve navegar nem mostrar toast
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Não deve navegar quando dialog está fechado
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ─── Gateway-Specific Tests ────────────────────────────────
describe('PixPaymentDialog — gateways', () => {
  it('deve usar mercadopago como gateway padrão', () => {
    render(<PixPaymentDialog {...defaultProps} />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockInvoke).toHaveBeenCalledWith('verify-payment', {
      body: { orderId: 'order-123', gateway: 'mercadopago' },
    });
  });
});
