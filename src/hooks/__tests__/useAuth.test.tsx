import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/hooks/useAuth';

export const mockToast = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const authMocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
  getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
  getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  updateUser: vi.fn(),
  verifyOtp: vi.fn(),
  linkIdentity: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: authMocks,
    from: vi.fn((table: string) => {
      if (table === 'user_roles') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () =>
            Object.assign(Promise.resolve({ data: null, error: null }), {
              maybeSingle: async () => ({ data: null, error: null }),
            }),
        }),
      };
    }),
  },
}));

const VALID_CPF = '11144477735';
const VALID_PHONE = '11987654321';
const VALID_PASSWORD = 'secret123';
const FULL_NAME = 'Gustavo Silva';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
});

const renderAuth = () => renderHook(() => useAuth(), { wrapper });

describe('useAuth.signUp — telefone como identidade', () => {
  it('envia phone em E.164 e metadata com cpf/nome/phone', async () => {
    authMocks.signUp.mockResolvedValue({
      data: { user: { identities: [{ id: 'x' }] }, session: null },
      error: null,
    });

    const { result } = renderAuth();

    await act(async () => {
      await result.current.signUp(VALID_PHONE, VALID_PASSWORD, FULL_NAME, VALID_CPF);
    });

    expect(authMocks.signUp).toHaveBeenCalledWith({
      phone: '+5511987654321',
      password: VALID_PASSWORD,
      options: {
        data: {
          full_name: FULL_NAME,
          cpf: VALID_CPF,
          // metadata em dígitos — profiles.phone exige ^\d{10,11}$ (CHECK)
          phone: VALID_PHONE,
        },
      },
    });
  });

  it('retorna erro de validação sem chamar supabase quando senha é fraca', async () => {
    const { result } = renderAuth();

    let response: { error: any };
    await act(async () => {
      response = await result.current.signUp(VALID_PHONE, '123', FULL_NAME, VALID_CPF);
    });

    expect(response!.error.message).toContain('Senha');
    expect(authMocks.signUp).not.toHaveBeenCalled();
  });

  it('mapeia "User already registered" para PHONE_ALREADY_EXISTS', async () => {
    authMocks.signUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });

    const { result } = renderAuth();

    let response: { error: any };
    await act(async () => {
      response = await result.current.signUp(VALID_PHONE, VALID_PASSWORD, FULL_NAME, VALID_CPF);
    });

    expect(response!.error.message).toBe('PHONE_ALREADY_EXISTS');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Telefone já cadastrado', variant: 'destructive' })
    );
  });

  it('detecta telefone duplicado via identities vazias', async () => {
    authMocks.signUp.mockResolvedValue({
      data: { user: { identities: [] }, session: null },
      error: null,
    });

    const { result } = renderAuth();

    let response: { error: any };
    await act(async () => {
      response = await result.current.signUp(VALID_PHONE, VALID_PASSWORD, FULL_NAME, VALID_CPF);
    });

    expect(response!.error.message).toBe('PHONE_ALREADY_EXISTS');
  });

  it('sucesso retorna error null e avisa sobre código no WhatsApp', async () => {
    authMocks.signUp.mockResolvedValue({
      data: { user: { identities: [{ id: 'x' }] }, session: null },
      error: null,
    });

    const { result } = renderAuth();

    let response: { error: any };
    await act(async () => {
      response = await result.current.signUp(VALID_PHONE, VALID_PASSWORD, FULL_NAME, VALID_CPF);
    });

    expect(response!.error).toBeNull();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Conta criada!' })
    );
  });
});

describe('useAuth.signIn — identificador inteligente', () => {
  it('usa email quando identificador é e-mail', async () => {
    authMocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    const { result } = renderAuth();

    await act(async () => {
      await result.current.signIn('  User@Example.com ', VALID_PASSWORD);
    });

    expect(authMocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'User@Example.com',
      password: VALID_PASSWORD,
    });
  });

  it('usa phone E.164 quando identificador é telefone', async () => {
    authMocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    const { result } = renderAuth();

    await act(async () => {
      await result.current.signIn(VALID_PHONE, VALID_PASSWORD);
    });

    expect(authMocks.signInWithPassword).toHaveBeenCalledWith({
      phone: '+5511987654321',
      password: VALID_PASSWORD,
    });
  });

  it('mostra toast destructive em erro de login', async () => {
    authMocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials' },
    });
    const { result } = renderAuth();

    await act(async () => {
      await result.current.signIn(VALID_PHONE, VALID_PASSWORD);
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro ao fazer login', variant: 'destructive' })
    );
  });
});

describe('useAuth.sendPhoneOtp', () => {
  it('deslogado: usa signInWithOtp e confirma envio', async () => {
    authMocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    authMocks.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    const { result } = renderAuth();

    let response: { error: any };
    await act(async () => {
      response = await result.current.sendPhoneOtp(VALID_PHONE);
    });

    expect(authMocks.signInWithOtp).toHaveBeenCalledWith({ phone: '+5511987654321' });
    expect(response!.error).toBeNull();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Código enviado!' })
    );
  });

  it('deslogado: traduz erro de número já registrado', async () => {
    authMocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    authMocks.signInWithOtp.mockResolvedValue({
      data: {},
      error: { message: 'Phone already registered by another user' },
    });
    const { result } = renderAuth();

    let response: { error: any };
    await act(async () => {
      response = await result.current.sendPhoneOtp(VALID_PHONE);
    });

    expect(response!.error).toBeTruthy();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro ao enviar código',
        description: 'Este telefone já tem uma conta. Faça login.',
      })
    );
  });

  it('logado: usa updateUser e não dispara signInWithOtp', async () => {
    authMocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    authMocks.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    const { result } = renderAuth();

    await act(async () => {
      await result.current.sendPhoneOtp(VALID_PHONE);
    });

    expect(authMocks.updateUser).toHaveBeenCalledWith({ phone: '+5511987654321' });
    expect(authMocks.signInWithOtp).not.toHaveBeenCalled();
  });
});

describe('useAuth.verifyPhoneOtp', () => {
  it('deslogado: verifica com type sms', async () => {
    authMocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    authMocks.verifyOtp.mockResolvedValue({ data: { user: {} }, error: null });
    const { result } = renderAuth();

    await act(async () => {
      await result.current.verifyPhoneOtp(VALID_PHONE, '123456');
    });

    expect(authMocks.verifyOtp).toHaveBeenCalledWith({
      phone: '+5511987654321',
      token: '123456',
      type: 'sms',
    });
  });

  it('logado: verifica com type phone_change', async () => {
    authMocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    authMocks.verifyOtp.mockResolvedValue({ data: { user: {} }, error: null });
    const { result } = renderAuth();

    await act(async () => {
      await result.current.verifyPhoneOtp(VALID_PHONE, '123456');
    });

    expect(authMocks.verifyOtp).toHaveBeenCalledWith({
      phone: '+5511987654321',
      token: '123456',
      type: 'phone_change',
    });
  });

  it('código inválido mostra toast destructive', async () => {
    authMocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    authMocks.verifyOtp.mockResolvedValue({ data: {}, error: { message: 'Token invalid' } });
    const { result } = renderAuth();

    let response: { error: any };
    await act(async () => {
      response = await result.current.verifyPhoneOtp(VALID_PHONE, '000000');
    });

    expect(response!.error).toBeTruthy();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Código inválido', variant: 'destructive' })
    );
  });
});

describe('useAuth.linkGoogle', () => {
  it('chama linkIdentity com provider google', async () => {
    authMocks.linkIdentity.mockResolvedValue({ data: {}, error: null });
    const { result } = renderAuth();

    let response: { error: any };
    await act(async () => {
      response = await result.current.linkGoogle();
    });

    expect(authMocks.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    expect(response!.error).toBeNull();
  });
});
