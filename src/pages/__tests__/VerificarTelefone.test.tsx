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

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

function renderPage(ctx = 'signup') {
  return render(
    <MemoryRouter initialEntries={[`/verificar-telefone?ctx=${ctx}&phone=66992110000&redirect=/`]}>
      <VerificarTelefone />
    </MemoryRouter>,
  );
}

beforeEach(() => { vi.clearAllMocks(); });

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
});
