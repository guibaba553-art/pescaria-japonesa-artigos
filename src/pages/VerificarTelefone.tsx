import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import japaLogo from '@/assets/japa-logo.png';
import { useAuth } from '@/hooks/useAuth';
import { canResend, RESEND_COOLDOWN_MS } from '@/lib/whatsappOtp';
import { formatPhone, sanitizeNumericInput } from '@/utils/validation';

export default function VerificarTelefone() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ctx = searchParams.get('ctx') ?? 'signup';
  const redirectTo = searchParams.get('redirect') ?? '/';
  const [phoneParam] = useState(searchParams.get('phone') ?? '');

  const { sendPhoneOtp, verifyPhoneOtp } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<number | null>(Date.now()); // código já enviado pela origem
  const [nowTick, setNowTick] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const i = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (code.length === 6 && !loading) void submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const submit = async (value: string) => {
    setLoading(true);
    const { error } = await verifyPhoneOtp(phoneParam, value);
    setLoading(false);
    if (!error) navigate(redirectTo, { replace: true });  // searchParams.get já decodifica
    else setCode('');
  };

  const handleResend = async () => {
    if (!canResend(lastSentAt, nowTick)) return;
    setLastSentAt(Date.now());
    await sendPhoneOtp(phoneParam);
  };

  const cooldownLeft = lastSentAt ? Math.max(0, Math.ceil((RESEND_COOLDOWN_MS - (nowTick - lastSentAt)) / 1000)) : 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <img src={japaLogo} alt="JAPAS" className="h-9 w-9 object-contain" />
          <span className="text-lg font-display font-bold tracking-tight">JAPAS<span className="text-primary">.</span></span>
        </div>

        <div className="mb-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-display font-black mb-1">Confirme seu telefone</h2>
          <p className="text-sm text-muted-foreground">
            Enviamos um código de 6 dígitos para{' '}
            <strong className="text-foreground">{formatPhone(phoneParam)}</strong> no WhatsApp.
          </p>
        </div>

        <div className="space-y-1.5 mb-4">
          <Label htmlFor="otp-code" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Código</Label>
          <Input
            id="otp-code"
            ref={inputRef}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(sanitizeNumericInput(e.target.value))}
            disabled={loading}
            className="h-14 rounded-xl text-center text-2xl tracking-[0.5em] font-bold"
          />
        </div>

        <Button onClick={handleResend} variant="ghost" size="sm" disabled={!canResend(lastSentAt, nowTick)}>
          {cooldownLeft > 0 ? `Reenviar em ${cooldownLeft}s` : 'Reenviar código'}
        </Button>

        <Button variant="ghost" size="sm" className="mt-4 -ml-2 text-muted-foreground" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Voltar
        </Button>
      </div>
    </div>
  );
}
