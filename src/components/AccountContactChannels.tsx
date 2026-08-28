import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle, Mail, Link2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { isValidBrMobile, toE164, toLocalDigits } from '@/lib/whatsappOtp';
import { formatPhone, sanitizeNumericInput } from '@/utils/validation';

export function AccountContactChannels() {
  const { user, sendPhoneOtp, verifyPhoneOtp, linkGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [password, setPassword] = useState('');
  const [changingPhone, setChangingPhone] = useState(false);

  if (!user) return null;

  const confirmedEmail = user.email_confirmed_at ? user.email : null;
  const phoneConfirmed = !!user.phone_confirmed_at;

  const handleSendEmailConfirmation = async () => {
    setSending(true);
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setSending(false);
    if (error) return toast.error('Erro ao enviar confirmação: ' + error.message);
    toast.success('Enviamos um link de confirmação para ' + email.trim());
  };

  const handleChangePhone = async () => {
    if (!isValidBrMobile(newPhone)) return toast.error('Telefone inválido');

    // Reautenticação antes da troca (spec 5.3). Contas criadas por OTP puro
    // não têm senha — se signInWithPassword falhar, cai para OTP no telefone
    // atual (updateUser mesmo phone → phone_change → verify) como reauth.
    const credentials = confirmedEmail
      ? { email: confirmedEmail, password }
      : { phone: toE164(user.phone ?? ''), password };
    const { error: pwError } = await supabase.auth.signInWithPassword(credentials);
    if (pwError) {
      const currentPhone = user.phone ?? '';
      const { error: otpError } = await sendPhoneOtp(currentPhone);
      if (otpError) return toast.error('Erro ao enviar código de confirmação: ' + otpError.message);
      const code = window.prompt('Digite o código enviado para o seu telefone atual:');
      if (!code) return;
      const { error: verifyError } = await verifyPhoneOtp(currentPhone, code);
      if (verifyError) return toast.error('Código inválido. A troca não foi concluída.');
    }

    const { error } = await sendPhoneOtp(newPhone);
    if (!error) {
      setChangingPhone(false);
      toast.success('Código enviado para o novo número. Confirme para concluir.');
      const code = window.prompt('Digite o código recebido no novo número:');
      if (code) await verifyPhoneOtp(newPhone, code);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="w-4 h-4 text-[#25D366]" /> Canais de contato</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
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
            <Badge variant="secondary" className="gap-1 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-3.5 h-3.5" /> Pendente
            </Badge>
          )}
        </div>

        <div className="border-t pt-4">
          <p className="font-medium flex items-center gap-2"><Mail className="w-4 h-4" /> E-mail</p>
          {confirmedEmail ? (
            <div className="flex items-center justify-between gap-4">
              <p className="text-muted-foreground truncate">{confirmedEmail}</p>
              <Badge className="border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" /> Confirmado
              </Badge>
            </div>
          ) : (
            <div className="mt-2 flex gap-2 max-w-md">
              <Input placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
              <Button onClick={handleSendEmailConfirmation} disabled={sending || !email}>Confirmar</Button>
            </div>
          )}
        </div>

        <div className="border-t pt-4">
          <p className="font-medium flex items-center gap-2"><Link2 className="w-4 h-4" /> Vinculações</p>
          {!user.app_metadata?.provider?.includes('google') && (
            <Button variant="outline" size="sm" className="mt-2" onClick={() => linkGoogle()}>Vincular conta Google</Button>
          )}
          <div className="mt-2">
            {changingPhone ? (
              <div className="space-y-2 max-w-md">
                <Input placeholder="Nova senha (confirmação)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <div className="flex gap-2">
                  <Input placeholder="(00) 00000-0000" value={formatPhone(newPhone)} onChange={(e) => setNewPhone(sanitizeNumericInput(e.target.value))} />
                  <Button onClick={handleChangePhone}>Trocar</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setChangingPhone(true)}>Trocar telefone</Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
