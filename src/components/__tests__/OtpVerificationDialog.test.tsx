import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OtpVerificationDialog } from '@/components/OtpVerificationDialog';

const mocks = vi.hoisted(() => ({
  sendPhoneOtp: vi.fn(async () => ({ error: null })),
  sendRecoveryOtp: vi.fn(async () => ({ error: null })),
  verifyPhoneOtp: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    sendPhoneOtp: mocks.sendPhoneOtp,
    sendRecoveryOtp: mocks.sendRecoveryOtp,
    verifyPhoneOtp: mocks.verifyPhoneOtp,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderDialog(overrides: Partial<Parameters<typeof OtpVerificationDialog>[0]> = {}) {
  return render(
    <OtpVerificationDialog
      open
      onOpenChange={vi.fn()}
      phone="66992110000"
      {...overrides}
    />,
  );
}

describe('OtpVerificationDialog', () => {
  it('aberta: exibe telefone formatado e dispara OTP automaticamente (autoSend)', async () => {
    renderDialog({ autoSend: true });
    expect(screen.getByText(/66\) 99211-0000/)).toBeInTheDocument();
    await waitFor(() => expect(mocks.sendPhoneOtp).toHaveBeenCalledWith('66992110000'));
  });

  it('sem autoSend não envia código ao abrir', () => {
    renderDialog();
    expect(mocks.sendPhoneOtp).not.toHaveBeenCalled();
  });

  it('código de 6 dígitos verifica, chama onSuccess e fecha', async () => {
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ autoSend: true, onSuccess, onOpenChange });
    await userEvent.type(screen.getByLabelText(/código/i), '123456');
    await waitFor(() => expect(mocks.verifyPhoneOtp).toHaveBeenCalledWith('66992110000', '123456'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('título customizado aparece', () => {
    renderDialog({ title: 'Autorize a troca' });
    expect(screen.getByText('Autorize a troca')).toBeInTheDocument();
  });

  it('alreadySent: não envia código ao abrir e cooldown de reenvio começa ativo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderDialog({ alreadySent: true });
    expect(mocks.sendPhoneOtp).not.toHaveBeenCalled();
    const resend = screen.getByRole('button', { name: /reenviar/i });
    expect(resend).toBeDisabled();
    await vi.advanceTimersByTimeAsync(61_000);
    await waitFor(() => expect(resend).not.toBeDisabled());
    await userEvent.click(resend);
    expect(mocks.sendRecoveryOtp).toHaveBeenCalledWith('66992110000');
    expect(mocks.sendPhoneOtp).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('seta Voltar no topo-esquerdo fecha o modal', () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('botão Reenviar fica centralizado abaixo do campo de código', () => {
    renderDialog({ alreadySent: true });
    const resend = screen.getByRole('button', { name: /reenviar/i });
    const wrapper = resend.closest('div');
    expect(wrapper?.className).toContain('justify-center');
  });
});
