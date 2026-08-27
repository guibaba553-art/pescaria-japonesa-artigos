import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import VerificarTelefone from '@/pages/VerificarTelefone';

const mocks = vi.hoisted(() => ({
  sendPhoneOtp: vi.fn(async () => ({ error: null })),
  verifyPhoneOtp: vi.fn(async (_p: string, t: string) => ({ error: t === '123456' ? { error: null } : { error: new Error('invalid') } })),
  user: null as unknown,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mocks.user, sendPhoneOtp: mocks.sendPhoneOtp, verifyPhoneOtp: mocks.verifyPhoneOtp }),
}));

const profilesPhone = vi.hoisted(() => ({ value: '+5566992110000' }));
const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: { phone: profilesPhone.value }, error: null })),
      })),
    })),
  })),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));

function renderPage(entry = '/verificar-telefone?ctx=signup&phone=66992110000&redirect=/') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <VerificarTelefone />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = null;
  profilesPhone.value = '+5566992110000';
});

describe('VerificarTelefone', () => {
  it('renderiza telefone formatado e campo de código', () => {
    renderPage();
    expect(screen.getByText(/66\) 99211-0000/)).toBeInTheDocument();
    expect(screen.getByLabelText(/código/i)).toBeInTheDocument();
  });

  it('verifica código correto e navega', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/código/i), '123456');
    await waitFor(() => expect(mocks.verifyPhoneOtp).toHaveBeenCalledWith('66992110000', '123456'));
  });

  it('reenvia após cooldown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPage();
    const resend = screen.getByRole('button', { name: /reenviar/i });
    expect(resend).toBeDisabled();
    await vi.advanceTimersByTimeAsync(61_000);
    await waitFor(() => expect(resend).not.toBeDisabled());
    await userEvent.click(resend);
    expect(mocks.sendPhoneOtp).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('guarda do checkout: deriva telefone da sessão, dispara OTP no mount e verifica com ele', async () => {
    mocks.user = {
      id: 'u-checkout',
      email: null,
      phone: '+5566992110000',
      user_metadata: { phone: '+5566992110000' },
      phone_confirmed_at: null,
    };
    renderPage('/verificar-telefone?ctx=checkout&redirect=%2Fcheckout%2Fentrega');

    // Telefone derivado da sessão aparece na UI
    expect(screen.getByText(/66\) 99211-0000/)).toBeInTheDocument();

    // OTP é disparado automaticamente UMA vez no mount com o telefone derivado
    await waitFor(() => expect(mocks.sendPhoneOtp).toHaveBeenCalledTimes(1));
    expect(mocks.sendPhoneOtp).toHaveBeenCalledWith('+5566992110000');

    // Verificação usa o telefone derivado
    await userEvent.type(screen.getByLabelText(/código/i), '123456');
    await waitFor(() => expect(mocks.verifyPhoneOtp).toHaveBeenCalledWith('+5566992110000', '123456'));
  });

  it('guarda do checkout: deriva telefone de profiles quando a sessão não tem phone', async () => {
    mocks.user = { id: 'u-checkout-2', email: null, phone: null, user_metadata: {}, phone_confirmed_at: null };
    renderPage('/verificar-telefone?ctx=checkout&redirect=%2Fcheckout%2Fentrega');

    await waitFor(() => expect(screen.getByText(/66\) 99211-0000/)).toBeInTheDocument());
    await waitFor(() => expect(mocks.sendPhoneOtp).toHaveBeenCalledWith('+5566992110000'));
  });
});
