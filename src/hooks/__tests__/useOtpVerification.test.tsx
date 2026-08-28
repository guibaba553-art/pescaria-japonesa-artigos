import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOtpVerification } from '@/hooks/useOtpVerification';

const mocks = vi.hoisted(() => ({
  sendPhoneOtp: vi.fn(async () => ({ error: null })),
  verifyPhoneOtp: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ sendPhoneOtp: mocks.sendPhoneOtp, verifyPhoneOtp: mocks.verifyPhoneOtp }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('useOtpVerification', () => {
  it('autoSend dispara o OTP UMA vez no mount', async () => {
    renderHook(() => useOtpVerification({ phone: '66992110000', autoSend: true }));
    await waitFor(() => expect(mocks.sendPhoneOtp).toHaveBeenCalledTimes(1));
    expect(mocks.sendPhoneOtp).toHaveBeenCalledWith('66992110000');
  });

  it('sem autoSend não envia nada no mount', () => {
    renderHook(() => useOtpVerification({ phone: '66992110000' }));
    expect(mocks.sendPhoneOtp).not.toHaveBeenCalled();
  });

  it('alreadySent: não envia, mas ativa o cooldown (reenvio desabilitado)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useOtpVerification({ phone: '66992110000', alreadySent: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.sendPhoneOtp).not.toHaveBeenCalled();
    expect(result.current.canResendNow).toBe(false);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(result.current.canResendNow).toBe(true);
  });

  it('6 dígitos acionam verify e chamam onSuccess', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useOtpVerification({ phone: '66992110000', onSuccess }));
    await act(async () => {
      result.current.setCode('123456');
    });
    await waitFor(() => expect(mocks.verifyPhoneOtp).toHaveBeenCalledWith('66992110000', '123456'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('verify com erro limpa o código e chama onError', async () => {
    mocks.verifyPhoneOtp.mockResolvedValueOnce({ error: new Error('invalid') });
    const onError = vi.fn();
    const { result } = renderHook(() => useOtpVerification({ phone: '66992110000', onError }));
    await act(async () => {
      result.current.setCode('999999');
    });
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(result.current.code).toBe('');
  });

  it('reenvio respeita o cooldown de 60s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useOtpVerification({ phone: '66992110000' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(result.current.canResendNow).toBe(true);
    await act(async () => {
      await result.current.handleResend();
    });
    expect(result.current.canResendNow).toBe(false);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(result.current.canResendNow).toBe(true);
  });
});