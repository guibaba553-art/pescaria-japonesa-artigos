import { useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOtpVerification } from '@/hooks/useOtpVerification';
import { formatPhone, sanitizeNumericInput } from '@/utils/validation';
import { toLocalDigits } from '@/lib/whatsappOtp';

interface OtpFormProps {
  phone: string;
  autoSend: boolean;
  alreadySent: boolean;
  onSuccess: () => void;
}

function OtpForm({ phone, autoSend, alreadySent, onSuccess }: OtpFormProps) {
  const { code, setCode, loading, canResendNow, cooldownLeft, handleResend } = useOtpVerification({
    phone,
    autoSend,
    alreadySent,
    onSuccess,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  inputRef.current?.focus?.();

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="otp-code" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Código
        </Label>
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
      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={handleResend} disabled={!canResendNow}>
          {cooldownLeft > 0 ? `Reenviar em ${cooldownLeft}s` : 'Reenviar código'}
        </Button>
      </div>
    </div>
  );
}

export interface OtpVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Telefone em dígitos (10-11) — exibido formatado e normalizado internamente */
  phone: string;
  title?: string;
  description?: string;
  /** Dispara o OTP automaticamente ao abrir (checkout/phone_change/reauth) */
  autoSend?: boolean;
  /** Código já enviado pela origem (signup/recovery): sem auto-send, cooldown ativo */
  alreadySent?: boolean;
  onSuccess?: () => void;
}

export function OtpVerificationDialog({
  open,
  onOpenChange,
  phone,
  title = 'Confirme seu telefone',
  description,
  autoSend = false,
  alreadySent = false,
  onSuccess,
}: OtpVerificationDialogProps) {
  const handleSuccess = () => {
    // Fecha ANTES do onSuccess: o caller pode reabrir encadeando o próximo
    // passo (ex.: reauth → OTP do novo número) no mesmo tick.
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 -mt-1 w-fit text-muted-foreground hover:text-foreground"
            onClick={() => onOpenChange(false)}
            aria-label="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ??
              `Enviamos um código de 6 dígitos para ${formatPhone(toLocalDigits(phone))} no WhatsApp.`}
          </DialogDescription>
        </DialogHeader>
        {/* Remount a cada abertura: estado limpo + auto-send novo */}
        {open && <OtpForm key={phone} phone={phone} autoSend={autoSend} alreadySent={alreadySent} onSuccess={handleSuccess} />}
      </DialogContent>
    </Dialog>
  );
}
