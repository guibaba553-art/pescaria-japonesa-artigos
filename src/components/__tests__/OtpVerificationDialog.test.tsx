import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OtpVerificationDialog } from '@/components/OtpVerificationDialog';

const mocks = vi.hoisted(() => ({
  sendPhoneOtp: vi.fn(async () => ({ error: null })),
  verifyPhoneOtp: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ sendPhoneOtp: mocks.sendPhoneOtp, verifyPhoneOtp: mocks.verifyPhoneOtp }),
}));

beforeEach(() => {
  vi.clearAllMocks();
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
});