import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle, Mail, Link2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { OtpVerificationDialog } from '@/components/OtpVerificationDialog';
import { toast } from 'sonner';
import { isValidBrMobile, toE164, toLocalDigits } from '@/lib/whatsappOtp';
import { formatPhone, sanitizeNumericInput } from '@/utils/validation';

export function AccountContactChannels() {
  const { user, linkGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [localPendingEmail, setLocalPendingEmail] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [password, setPassword] = useState('');
  const [changingPhone, setChangingPhone] = useState(false);
  // Fluxo da troca em MODAL: 'reauth' (OTP no número atual) → 'new' (OTP no novo)
  const [otpStep, setOtpStep] = useState<'reauth' | 'new' | null>(null);
  const [otpPhone, setOtpPhone] = useState('');

  if (!user) return null;

  const confirmedEmail = user.email_confirmed_at ? user.email : null;
  const pendingEmail = user.new_email || localPendingEmail;
  const phoneConfirmed = !!user.phone_confirmed_at;

  const handleSendEmailConfirmation = async () => {
    const value = email.trim();
    if (!value) return;
    setSending(true);
    const { error } = await supabase.auth.updateUser({ email: value });
    setSending(false);
    if (error) return toast.error('Erro ao enviar confirmação: ' + error.message);
    setLocalPendingEmail(value);
    setEditingEmail(false);
    toast.success('Enviamos um link de confirmação para ' + value);
  };

  const handleChangePhone = async () => {
    if (!isValidBrMobile(newPhone)) return toast.error('Telefone inválido');
    setSending(true);

    // Reautenticação antes da troca (spec 5.3) — via MODAL de OTP no número
    // atual (sem popups). Após autorizar, a modal encadeia para o novo número.
    const credentials = confirmedEmail
      ? { email: confirmedEmail, password }
      : { phone: toE164(user.phone ?? ''), password };
    const { error: pwError } = await supabase.auth.signInWithPassword(credentials);
    if (pwError) {
      setChangingPhone(false);
      setSending(false);
      setOtpPhone(toLocalDigits(user.phone ?? ''));
      setOtpStep('reauth');
      return;
    }

    setChangingPhone(false);
    setSending(false);
    setOtpPhone(newPhone);
    setOtpStep('new');
    toast.success('Código enviado para o novo número. Confirme para concluir.');
  };

  return (
    <Card className="mb-6">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="w-4 h-4 text-[#25D366]" /> Canais de contato</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* ── WhatsApp ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">WhatsApp</p>
              <p className="text-muted-foreground">{formatPhone(toLocalDigits(user.phone ?? ''))}</p>
            </div>
            {phoneConfirmed ? (
              <Badge className="border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Verificado
              </Badge>
            ) : (
              <Badge className="border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-400 gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> Pendente
              </Badge>
            )}
          </div>

          <div className="mt-3">
            {changingPhone ? (
              <div className="space-y-2 max-w-md rounded-lg border bg-muted/40 p-3">
                <Input placeholder="Senha atual (confirmação)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <div className="flex gap-2">
                  <Input placeholder="(00) 00000-0000" value={formatPhone(newPhone)} onChange={(e) => setNewPhone(sanitizeNumericInput(e.target.value))} />
                  <Button onClick={handleChangePhone} disabled={sending}>Confirmar troca</Button>
                  <Button variant="ghost" onClick={() => { setChangingPhone(false); setNewPhone(''); setPassword(''); }}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setChangingPhone(true)}>Trocar telefone</Button>
            )}
          </div>
        </div>

        {/* ── E-mail ───────────────────────────────────────────────────── */}
        <div className="border-t pt-4">
          <p className="font-medium flex items-center gap-2"><Mail className="w-4 h-4" /> E-mail</p>
          {confirmedEmail ? (
            <div className="flex items-center justify-between gap-4 mt-1">
              <p className="text-muted-foreground truncate">{confirmedEmail}</p>
              <Badge className="border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" /> Confirmado
              </Badge>
            </div>
          ) : !editingEmail && pendingEmail ? (
            <div className="flex items-center justify-between gap-4 mt-1">
              <p className="text-muted-foreground truncate">{pendingEmail}</p>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className="border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-400 gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Pendente de verificação
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setEditingEmail(true); setEmail(pendingEmail); }}
                >
                  Alterar
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex gap-2 max-w-md">
              <Input
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                disabled={sending}
              />
              <Button onClick={handleSendEmailConfirmation} disabled={sending || !email.trim()}>
                {sending ? 'Enviando...' : pendingEmail ? 'Confirmar novo' : 'Adicionar e-mail'}
              </Button>
              {pendingEmail && (
                <Button variant="ghost" onClick={() => { setEditingEmail(false); setEmail(''); }}>Cancelar</Button>
              )}
            </div>
          )}
        </div>

        {/* ── Vinculações ──────────────────────────────────────────────── */}
        <div className="border-t pt-4">
          <p className="font-medium flex items-center gap-2"><Link2 className="w-4 h-4" /> Vinculações</p>
          {!user.app_metadata?.provider?.includes('google') && (
            <Button variant="outline" size="sm" className="mt-2" onClick={() => linkGoogle()}>Vincular conta Google</Button>
          )}
        </div>
      </CardContent>

      <OtpVerificationDialog
        open={otpStep !== null}
        onOpenChange={(open) => { if (!open) setOtpStep(null); }}
        phone={otpPhone}
        autoSend
        title={otpStep === 'reauth' ? 'Autorize a troca de telefone' : 'Confirme o novo número'}
        description={
          otpStep === 'reauth'
            ? 'Confirmamos o número atual para liberar a troca.'
            : `Enviamos um código de 6 dígitos para ${formatPhone(newPhone)} no WhatsApp.`
        }
        onSuccess={() => {
          if (otpStep === 'reauth') {
            // Encadeia: reauth OK → OTP no novo número (remount com key=phone)
            setOtpPhone(newPhone);
            setOtpStep('new');
          } else {
            setOtpStep(null);
            setNewPhone('');
            setPassword('');
          }
        }}
      />
    </Card>
  );
}