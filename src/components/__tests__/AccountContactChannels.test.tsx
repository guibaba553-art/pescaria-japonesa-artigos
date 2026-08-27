import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = {
  updateUser: vi.fn(),
  signInWithPassword: vi.fn(),
  sendPhoneOtp: vi.fn(),
  verifyPhoneOtp: vi.fn(),
  linkGoogle: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
  prompt: vi.fn(),
};

interface MockUser {
  id: string;
  phone: string | null;
  phone_confirmed_at: string | null;
  email: string | null;
  email_confirmed_at: string | null;
  app_metadata: { provider: string[] };
}

let mockUser: MockUser = {
  id: 'user-123',
  phone: '+5511999999999',
  phone_confirmed_at: '2026-01-01T00:00:00Z',
  email: 'joao@email.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: ['email'] },
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      updateUser: mocks.updateUser,
      signInWithPassword: mocks.signInWithPassword,
    },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    sendPhoneOtp: mocks.sendPhoneOtp,
    verifyPhoneOtp: mocks.verifyPhoneOtp,
    linkGoogle: mocks.linkGoogle,
  }),
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));

beforeEach(() => {
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.sendPhoneOtp.mockResolvedValue({ error: null });
  mocks.verifyPhoneOtp.mockResolvedValue({ error: null });
  mocks.prompt.mockReturnValue('123456');
  vi.stubGlobal('prompt', mocks.prompt);
  mockUser = {
    id: 'user-123',
    phone: '+5511999999999',
    phone_confirmed_at: '2026-01-01T00:00:00Z',
    email: 'joao@email.com',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: ['email'] },
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('AccountContactChannels — WhatsApp / e-mail / vínculos', () => {
  it('exibe WhatsApp com telefone formatado e status verificado', async () => {
    const { AccountContactChannels } = await import('@/components/AccountContactChannels');
    render(<AccountContactChannels />);
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    expect(screen.getByText(/\(11\) 99999-9999 · verificado/)).toBeInTheDocument();
  });

  it('exibe pendente quando telefone não confirmado', async () => {
    mockUser.phone_confirmed_at = null;
    const { AccountContactChannels } = await import('@/components/AccountContactChannels');
    render(<AccountContactChannels />);
    expect(screen.getByText(/\(11\) 99999-9999 · pendente/)).toBeInTheDocument();
  });

  it('exibe e-mail confirmado quando email_confirmed_at existe', async () => {
    const { AccountContactChannels } = await import('@/components/AccountContactChannels');
    render(<AccountContactChannels />);
    expect(screen.getByText('joao@email.com · confirmado')).toBeInTheDocument();
  });

  it('exibe input + botão Confirmar quando e-mail não confirmado', async () => {
    mockUser.email_confirmed_at = null;
    const { AccountContactChannels } = await import('@/components/AccountContactChannels');
    render(<AccountContactChannels />);
    expect(screen.getByPlaceholderText('seu@email.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
  });

  it('mostra botão Vincular conta Google quando não vinculado', async () => {
    const { AccountContactChannels } = await import('@/components/AccountContactChannels');
    render(<AccountContactChannels />);
    expect(screen.getByRole('button', { name: 'Vincular conta Google' })).toBeInTheDocument();
  });

  it('NÃO mostra botão Vincular Google quando já vinculado', async () => {
    mockUser.app_metadata = { provider: ['google', 'email'] };
    const { AccountContactChannels } = await import('@/components/AccountContactChannels');
    render(<AccountContactChannels />);
    expect(screen.queryByRole('button', { name: 'Vincular conta Google' })).not.toBeInTheDocument();
  });

  it('mostra botão Trocar telefone', async () => {
    const { AccountContactChannels } = await import('@/components/AccountContactChannels');
    render(<AccountContactChannels />);
    expect(screen.getByRole('button', { name: 'Trocar telefone' })).toBeInTheDocument();
  });
});

describe('AccountContactChannels — confirmação de e-mail', () => {
  it('chama updateUser com o e-mail digitado e mostra sucesso', async () => {
    mockUser.email_confirmed_at = null;
    const { AccountContactChannels } = await import('@/components/AccountContactChannels');
    render(<AccountContactChannels />);
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), {
      target: { value: 'novo@email.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => {
      expect(mocks.updateUser).toHaveBeenCalledWith({ email: 'novo@email.com' });
      expect(mocks.toast.success).toHaveBeenCalled();
    });
  });

  it('mostra erro quando updateUser falha', async () => {
    mockUser.email_confirmed_at = null;
    mocks.updateUser.mockResolvedValue({ error: { message: 'email inválido' } });
    const { AccountContactChannels } = await import('@/components/AccountContactChannels');
    render(<AccountContactChannels />);
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), {
      target: { value: 'novo@email.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => {
      expect(mocks.toast.error).toHaveBeenCalled();
    });
  });
});

describe('AccountContactChannels — troca de telefone exige senha', () => {
  it('valida telefone inválido e não chama signInWithPassword', async () => {
    const { AccountContactChannels } = await import('@/components/AccountContactChannels');
    render(<AccountContactChannels />);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar telefone' }));
    fireEvent.change(screen.getByPlaceholderText('(00) 00000-0000'), {
      target: { value: '119' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Trocar' }));
    await waitFor(() => {
      expect(mocks.toast.error).toHaveBeenCalledWith('Telefone inválido');
      expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    });
  });

  it('conta com e-mail confirmado reautentica com email+senha antes de trocar', async () => {
    const { AccountContactChannels } = await import('@/components/AccountContactChannels');
    render(<AccountContactChannels />);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar telefone' }));
    fireEvent.change(screen.getByPlaceholderText('(00) 00000-0000'), {
      target: { value: '11988887777' },
    });
    fireEvent.change(screen.getByPlaceholderText('Nova senha (confirmação)'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Trocar' }));
    await waitFor(() => {
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({
        email: 'joao@email.com',
        password: '123456',
      });
      expect(mocks.sendPhoneOtp).toHaveBeenCalledWith('11988887777');
      expect(mocks.prompt).toHaveBeenCalled();
      expect(mocks.verifyPhoneOtp).toHaveBeenCalledWith('11988887777', '123456');
    });
  });

  it('conta sem e-mail confirmado reautentica com phone+senha', async () => {
    mockUser.email = null;
    mockUser.email_confirmed_at = null;
    const { AccountContactChannels } = await import('@/components/AccountContactChannels');
    render(<AccountContactChannels />);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar telefone' }));
    fireEvent.change(screen.getByPlaceholderText('(00) 00000-0000'), {
      target: { value: '11988887777' },
    });
    fireEvent.change(screen.getByPlaceholderText('Nova senha (confirmação)'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Trocar' }));
    await waitFor(() => {
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({
        phone: '+5511999999999',
        password: '123456',
      });
    });
  });

  it('senha incorreta cai para reauth por OTP no telefone atual e a troca prossegue', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login' } });
    const { AccountContactChannels } = await import('@/components/AccountContactChannels');
    render(<AccountContactChannels />);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar telefone' }));
    fireEvent.change(screen.getByPlaceholderText('(00) 00000-0000'), {
      target: { value: '11988887777' },
    });
    fireEvent.change(screen.getByPlaceholderText('Nova senha (confirmação)'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Trocar' }));
    await waitFor(() => {
      // reauth via OTP no telefone atual
      expect(mocks.sendPhoneOtp).toHaveBeenCalledWith('+5511999999999');
      expect(mocks.verifyPhoneOtp).toHaveBeenCalledWith('+5511999999999', '123456');
      // e a troca acontece com OTP no novo número
      expect(mocks.sendPhoneOtp).toHaveBeenCalledWith('11988887777');
      expect(mocks.verifyPhoneOtp).toHaveBeenCalledWith('11988887777', '123456');
    });
  });

  it('conta só-telefone sem senha: reauth por OTP no telefone atual e a troca acontece', async () => {
    mockUser.email = null;
    mockUser.email_confirmed_at = null;
    mocks.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login' } });
    const { AccountContactChannels } = await import('@/components/AccountContactChannels');
    render(<AccountContactChannels />);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar telefone' }));
    fireEvent.change(screen.getByPlaceholderText('(00) 00000-0000'), {
      target: { value: '11988887777' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Trocar' }));
    await waitFor(() => {
      expect(mocks.sendPhoneOtp).toHaveBeenCalledWith('+5511999999999');
      expect(mocks.verifyPhoneOtp).toHaveBeenCalledWith('+5511999999999', '123456');
      expect(mocks.sendPhoneOtp).toHaveBeenCalledWith('11988887777');
    });
  });

  it('reauth por OTP com código inválido bloqueia a troca', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login' } });
    mocks.verifyPhoneOtp.mockResolvedValue({ error: { message: 'código inválido' } });
    const { AccountContactChannels } = await import('@/components/AccountContactChannels');
    render(<AccountContactChannels />);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar telefone' }));
    fireEvent.change(screen.getByPlaceholderText('(00) 00000-0000'), {
      target: { value: '11988887777' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Trocar' }));
    await waitFor(() => {
      expect(mocks.verifyPhoneOtp).toHaveBeenCalledWith('+5511999999999', '123456');
    });
    // NÃO prossegue para o OTP do novo número
    expect(mocks.sendPhoneOtp).not.toHaveBeenCalledWith('11988887777');
  });
});
