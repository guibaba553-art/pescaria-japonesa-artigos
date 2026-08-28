import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ForgotPassword from '@/pages/ForgotPassword';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  resetPassword: vi.fn(async () => ({ error: null })),
  sendRecoveryOtp: vi.fn(async () => ({ error: null })),
  toastError: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ resetPassword: mocks.resetPassword, sendRecoveryOtp: mocks.sendRecoveryOtp }),
}));

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ForgotPassword — recuperação por e-mail', () => {
  it('envia email e navega de volta após 2s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('seu@email.com'), 'a@b.com');
    fireEvent.click(screen.getByRole('button', { name: /enviar instruções/i }));
    await vi.advanceTimersByTimeAsync(2100);
    expect(mocks.resetPassword).toHaveBeenCalledWith('a@b.com');
    expect(mocks.navigate).toHaveBeenCalledWith('/auth');
  });
});

describe('ForgotPassword — recuperação via WhatsApp', () => {
  it('aba WhatsApp envia OTP e navega para verificação com redirect ao reset', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /whatsapp/i }));
    await userEvent.type(screen.getByPlaceholderText('(00) 00000-0000'), '66992110000');
    fireEvent.click(screen.getByRole('button', { name: /recuperar via whatsapp/i }));
    await waitFor(() => expect(mocks.sendRecoveryOtp).toHaveBeenCalledWith('66992110000'));
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith(
        '/verificar-telefone?ctx=recovery&phone=66992110000&redirect=%2Freset-password',
      ),
    );
  });

  it('telefone inválido mostra erro e não envia', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /whatsapp/i }));
    await userEvent.type(screen.getByPlaceholderText('(00) 00000-0000'), '123');
    fireEvent.click(screen.getByRole('button', { name: /recuperar via whatsapp/i }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('DDD')));
    expect(mocks.sendRecoveryOtp).not.toHaveBeenCalled();
  });
});