import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { SavedMethod } from '@/types/payment';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CreditCard, Plus, Trash2, Star, Loader2, ShieldCheck } from 'lucide-react';
import { CreditCardForm, type CreditCardFormHandle } from '@/components/CreditCardForm';
import { validateCardNumber } from '@/lib/creditCardValidation';




export function MyPaymentMethods() {
  const { user } = useAuth();
  const [methods, setMethods] = useState<SavedMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'debit_card'>('credit_card');
  const [isDefault, setIsDefault] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const creditCardRef = useRef<CreditCardFormHandle>(null);
  const [profileInfo, setProfileInfo] = useState<{ name: string; email: string; cpf: string; phone: string } | null>(null);

  // Load profile data for pre-fill
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('full_name, cpf, phone')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfileInfo({
            name: data.full_name || '',
            email: user.email || '',
            cpf: data.cpf || '',
            phone: data.phone || '',
          });
        }
      });
  }, [user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('saved_payment_methods')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('last_used_at', { ascending: false, nullsFirst: false });

    if (error) {
      toast.error(error.message);
    } else {
      setMethods((data as SavedMethod[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSubmit = async () => {
    if (!user) return;
    const cardData = creditCardRef.current?.getData();
    if (!cardData) return; // validation errors shown inline by CreditCardForm

    const fullNumber = cardData.creditCard.number;
    const { brand } = validateCardNumber(fullNumber);
    const detectedBrand = brand ?? 'Outro';
    const last4 = fullNumber.slice(-4);

    setSaving(true);

    // Tokenizar cartão via edge function (Asaas) — agora envia ccv também
    const { data: tokenResult, error: tokenError } = await supabase.functions.invoke('tokenize-card', {
      body: {
        cardNumber: fullNumber,
        holderName: cardData.creditCard.holderName,
        expiryMonth: cardData.creditCard.expiryMonth,
        expiryYear: cardData.creditCard.expiryYear,
        ccv: cardData.creditCard.ccv,
      },
    });

    if (tokenError || !tokenResult?.success) {
      setSaving(false);
      toast.error(tokenResult?.error || tokenError?.message || 'Tente novamente.');
      return;
    }

    const creditCardToken = tokenResult?.creditCardToken;

    // Só salva se a tokenização retornou um token válido
    if (!creditCardToken || typeof creditCardToken !== 'string' || creditCardToken.length < 10) {
      setSaving(false);
      toast.error('Falha ao tokenizar cartão. Tente novamente.');
      return;
    }

    const { error } = await supabase.from('saved_payment_methods').insert({
      user_id: user.id,
      payment_method: paymentMethod,
      card_brand: detectedBrand,
      cardholder_name: cardData.creditCard.holderName,
      card_last4: last4,
      card_exp_month: cardData.creditCard.expiryMonth,
      card_exp_year: cardData.creditCard.expiryYear,
      is_default: isDefault,
      asaas_credit_card_token: creditCardToken,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Forma de pagamento adicionada!');
    setDialogOpen(false);
    setPaymentMethod('credit_card');
    setIsDefault(false);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('saved_payment_methods').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Forma de pagamento removida');
    setConfirmDelete(null);
    load();
  };

  const handleSetDefault = async (id: string) => {
    if (!user) return;
    const { error } = await supabase
      .from('saved_payment_methods')
      .update({ is_default: true })
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Definido como padrão');
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Formas de Pagamento</h2>
          <p className="text-sm text-muted-foreground">
            Cartões salvos para checkout mais rápido.
          </p>
        </div>
        <Button onClick={() => { setDialogOpen(true); }} className="rounded-full">
          <Plus className="w-4 h-4 mr-2" />
          Adicionar
        </Button>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
        <ShieldCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          Por segurança, armazenamos apenas a bandeira, validade e os 4 últimos dígitos do cartão.
          O número completo e o CVV nunca são guardados.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : methods.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed rounded-xl">
          <CreditCard className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Nenhuma forma de pagamento cadastrada.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {methods.map((m) => (
            <div
              key={m.id}
              className="relative p-4 rounded-xl border bg-gradient-to-br from-card to-muted/30 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm leading-tight">
                      {m.card_brand ?? 'Cartão'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.payment_method === 'debit_card' ? 'Débito' : 'Crédito'}
                    </p>
                  </div>
                </div>
                {m.is_default && (
                  <Badge className="bg-primary text-primary-foreground gap-1">
                    <Star className="w-3 h-3 fill-current" />
                    Padrão
                  </Badge>
                )}
              </div>

              <div className="font-mono text-base tracking-wider text-foreground/80">
                •••• •••• •••• {m.card_last4 ?? '????'}
              </div>

              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="truncate max-w-[60%]">{m.cardholder_name ?? '—'}</span>
                {m.card_exp_month && m.card_exp_year && (
                  <span>Val. {m.card_exp_month}/{m.card_exp_year}</span>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                {!m.is_default && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleSetDefault(m.id)}
                  >
                    <Star className="w-3 h-3 mr-1" />
                    Padrão
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(m.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Adicionar forma de pagamento</DialogTitle>
            <DialogDescription>
              Cadastre os dados do cartão para agilizar o checkout.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as 'credit_card' | 'debit_card')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
                  <SelectItem value="debit_card">Cartão de Débito</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <CreditCardForm
              ref={creditCardRef}
              totalAmount={0}
              onInstallmentChange={() => {}}
              hideExtras
              variant="inline"
              loading={saving}
              columns={2}
              initialHolderInfo={profileInfo ?? undefined}
            />

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm">Definir como forma de pagamento padrão</span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover forma de pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O cartão será removido da sua conta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
