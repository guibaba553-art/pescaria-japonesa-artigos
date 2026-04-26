import { useEffect, useState } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

interface SavedMethod {
  id: string;
  payment_method: string;
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: string | null;
  card_exp_year: string | null;
  cardholder_name: string | null;
  is_default: boolean;
  last_used_at: string | null;
}

const BRANDS = ['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard', 'Diners', 'Outro'] as const;

const cardSchema = z.object({
  payment_method: z.enum(['credit_card', 'debit_card']),
  card_brand: z.string().min(1, 'Selecione a bandeira'),
  cardholder_name: z.string().trim().min(2, 'Informe o nome no cartão').max(100),
  card_last4: z.string().regex(/^\d{4}$/, 'Informe os 4 últimos dígitos'),
  card_exp_month: z.string().regex(/^(0[1-9]|1[0-2])$/, 'Mês inválido (01-12)'),
  card_exp_year: z.string().regex(/^\d{2}$/, 'Ano com 2 dígitos (ex: 28)'),
  is_default: z.boolean().default(false),
});

type CardForm = z.infer<typeof cardSchema>;

const DEFAULT_FORM: CardForm = {
  payment_method: 'credit_card',
  card_brand: '',
  cardholder_name: '',
  card_last4: '',
  card_exp_month: '',
  card_exp_year: '',
  is_default: false,
};

export function MyPaymentMethods() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [methods, setMethods] = useState<SavedMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CardForm>(DEFAULT_FORM);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
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
    const parsed = cardSchema.safeParse(form);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      toast({ title: 'Dados inválidos', description: first.message, variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('saved_payment_methods').insert({
      user_id: user.id,
      payment_method: parsed.data.payment_method,
      card_brand: parsed.data.card_brand,
      cardholder_name: parsed.data.cardholder_name,
      card_last4: parsed.data.card_last4,
      card_exp_month: parsed.data.card_exp_month,
      card_exp_year: parsed.data.card_exp_year,
      is_default: parsed.data.is_default,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Forma de pagamento adicionada!' });
    setDialogOpen(false);
    setForm(DEFAULT_FORM);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('saved_payment_methods').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Forma de pagamento removida' });
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
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Definido como padrão' });
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
        <Button onClick={() => { setForm(DEFAULT_FORM); setDialogOpen(true); }} className="rounded-full">
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar forma de pagamento</DialogTitle>
            <DialogDescription>
              Cadastre os dados do cartão. Não pedimos número completo nem CVV.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.payment_method}
                onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v as 'credit_card' | 'debit_card' }))}
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

            <div className="space-y-1.5">
              <Label>Bandeira</Label>
              <Select
                value={form.card_brand}
                onValueChange={(v) => setForm((f) => ({ ...f, card_brand: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {BRANDS.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Nome impresso no cartão</Label>
              <Input
                value={form.cardholder_name}
                onChange={(e) => setForm((f) => ({ ...f, cardholder_name: e.target.value.toUpperCase() }))}
                placeholder="JOÃO DA SILVA"
                maxLength={100}
              />
            </div>

            <div className="space-y-1.5">
              <Label>4 últimos dígitos</Label>
              <Input
                inputMode="numeric"
                value={form.card_last4}
                onChange={(e) =>
                  setForm((f) => ({ ...f, card_last4: e.target.value.replace(/\D/g, '').slice(0, 4) }))
                }
                placeholder="0000"
                maxLength={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Validade (mês)</Label>
                <Input
                  inputMode="numeric"
                  value={form.card_exp_month}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, card_exp_month: e.target.value.replace(/\D/g, '').slice(0, 2) }))
                  }
                  placeholder="MM"
                  maxLength={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Validade (ano)</Label>
                <Input
                  inputMode="numeric"
                  value={form.card_exp_year}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, card_exp_year: e.target.value.replace(/\D/g, '').slice(0, 2) }))
                  }
                  placeholder="AA"
                  maxLength={2}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
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
