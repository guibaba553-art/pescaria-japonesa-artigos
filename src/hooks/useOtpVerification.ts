import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { canResend, RESEND_COOLDOWN_MS } from '@/lib/whatsappOtp';

export interface UseOtpVerificationOptions {
  /** Telefone em dígitos (10-11) — normalizado para E.164 internamente */
  phone: string;
  /** Dispara o OTP automaticamente no mount (checkout/phone_change/reauth) */
  autoSend?: boolean;
  /** Código já enviado pela origem (signup/login/recovery): sem auto-send,
   *  mas o cooldown de reenvio começa ativo */
  alreadySent?: boolean;
  /** Chamado após verify com sucesso */
  onSuccess?: () => void;
  /** Chamado quando o verify falha */
  onError?: () => void;
}

export function useOtpVerification({ phone, autoSend = false, alreadySent = false, onSuccess, onError }: UseOtpVerificationOptions) {
  const { sendPhoneOtp, verifyPhoneOtp } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const autoSentRef = useRef(false);

  useEffect(() => {
    const i = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  // Envio do código: auto-send no mount OU "já enviado" (cooldown ativo)
  useEffect(() => {
    if (!phone || autoSentRef.current) return;
    autoSentRef.current = true;
    if (alreadySent) {
      setLastSentAt(Date.now());
      return;
    }
    if (!autoSend) return;
    sendPhoneOtp(phone).then(({ error }) => {
      if (!error) setLastSentAt(Date.now());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  useEffect(() => {
    if (code.length === 6 && !loading) void submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const submit = async (value: string) => {
    setLoading(true);
    const { error } = await verifyPhoneOtp(phone, value);
    setLoading(false);
    if (!error) {
      onSuccess?.();
    } else {
      setCode('');
      onError?.();
    }
  };

  const handleResend = async () => {
    if (!canResend(lastSentAt, nowTick)) return;
    setLastSentAt(Date.now());
    await sendPhoneOtp(phone);
  };

  return {
    code,
    setCode,
    loading,
    canResendNow: canResend(lastSentAt, nowTick),
    cooldownLeft: lastSentAt ? Math.max(0, Math.ceil((RESEND_COOLDOWN_MS - (nowTick - lastSentAt)) / 1000)) : 0,
    handleResend,
  };
}