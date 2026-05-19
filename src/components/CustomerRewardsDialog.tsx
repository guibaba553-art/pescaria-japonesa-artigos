import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Gift, Ban, Plus, Trash2, Loader2, Pencil, X, Search } from 'lucide-react';
import { loadTiers, type CustomerTier } from '@/utils/customerTiers';

type Kind = 'reward' | 'punishment';
type Scope = 'customer' | 'tier';
type Effect = 'discount_percent' | 'free_gift' | 'block_purchase' | 'block_discount' | 'note';

interface Reward {
  id: string;
  kind: Kind;
  scope: Scope;
  customer_id: string | null;
  tier_id: string | null;
  title: string;
  description: string | null;
  effect: Effect;
  value: number | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

interface CustomerLite {
  id: string;
  full_name: string;
  company_name: string | null;
  cpf: string | null;
  cnpj: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialCustomerId?: string | null;
}

const EFFECT_LABEL: Record<Effect, string> = {
  discount_percent: 'Desconto %',
  free_gift: 'Brinde',
  block_purchase: 'Bloquear venda',
  block_discount: 'Bloquear desconto',
  note: 'Anotação',
};

const blank = (initialCustomerId?: string | null): Partial<Reward> => ({
  kind: 'reward',
  scope: initialCustomerId ? 'customer' : 'tier',
  customer_id: initialCustomerId || null,
  tier_id: null,
  title: '',
  description: '',
  effect: 'note',
  value: null,
  is_active: true,
  starts_at: null,
  ends_at: null,
});

export function CustomerRewardsDialog({ open, onOpenChange, initialCustomerId }: Props) {
  const [tiers, setTiers] = useState<CustomerTier[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [list, setList] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Partial<Reward> | null>(null);
  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    loadTiers().then(setTiers);
    loadCustomers();
    loadList();
  }, [open]);

  const loadCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('id, full_name, company_name, cpf, cnpj')
      .order('full_name', { ascending: true });
    setCustomers((data as CustomerLite[]) || []);
  };

  const loadList = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('customer_rewards')
      .select('*')
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
      return;
    }
    setList((data as Reward[]) || []);
  };

  const customerName = (id: string | null) => {
    if (!id) return '—';
    const c = customers.find((x) => x.id === id);
    return c?.company_name || c?.full_name || id.slice(0, 8);
  };
  const tierName = (id: string | null) =>
    tiers.find((t) => t.id === id)?.name || (id ? id.slice(0, 8) : '—');
  const tierColor = (id: string | null) => tiers.find((t) => t.id === id)?.color;

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 50);
    return customers
      .filter((c) =>
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.company_name || '').toLowerCase().includes(q) ||
        (c.cpf || '').includes(q) ||
        (c.cnpj || '').includes(q)
      )
      .slice(0, 50);
  }, [customers, customerSearch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const cName = (customerName(r.customer_id) || '').toLowerCase();
      const tName = (tierName(r.tier_id) || '').toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        cName.includes(q) ||
        tName.includes(q)
      );
    });
  }, [list, search, customers, tiers]);

  const save = async () => {
    if (!editing) return;
    if (!editing.title?.trim()) {
      toast({ title: 'Informe o título', variant: 'destructive' });
      return;
    }
    if (editing.scope === 'customer' && !editing.customer_id) {
      toast({ title: 'Selecione o cliente', variant: 'destructive' });
      return;
    }
    if (editing.scope === 'tier' && !editing.tier_id) {
      toast({ title: 'Selecione a faixa', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      kind: editing.kind,
      scope: editing.scope,
      customer_id: editing.scope === 'customer' ? editing.customer_id : null,
      tier_id: editing.scope === 'tier' ? editing.tier_id : null,
      title: editing.title.trim(),
      description: editing.description?.trim() || null,
      effect: editing.effect || 'note',
      value: editing.value ?? null,
      is_active: editing.is_active ?? true,
      starts_at: editing.starts_at || null,
      ends_at: editing.ends_at || null,
    };
    const { error } = editing.id
      ? await supabase.from('customer_rewards').update(payload).eq('id', editing.id)
      : await supabase.from('customer_rewards').insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: editing.id ? 'Atualizado' : 'Criado' });
    setEditing(null);
    loadList();
  };

  const remove = async (id: string) => {
    if (!confirm('Remover este item?')) return;
    const { error } = await supabase.from('customer_rewards').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
      return;
    }
    loadList();
  };

  const toggleActive = async (r: Reward) => {
    const { error } = await supabase
      .from('customer_rewards')
      .update({ is_active: !r.is_active })
      .eq('id', r.id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    loadList();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5" /> Recompensas & Punições
          </DialogTitle>
          <DialogDescription>
            Crie recompensas ou punições exclusivas para um cliente ou para uma faixa inteira.
          </DialogDescription>
        </DialogHeader>

        {!editing ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por título, cliente ou faixa..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button onClick={() => setEditing(blank(initialCustomerId))}>
                <Plus className="w-4 h-4 mr-1" /> Novo
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando...
              </div>
            ) : filtered.length === 0 ? (
              <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
                Nenhuma recompensa ou punição cadastrada.
              </div>
            ) : (
              <div className="border rounded-md divide-y">
                {filtered.map((r) => {
                  const isReward = r.kind === 'reward';
                  return (
                    <div key={r.id} className="p-3 flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
                          isReward
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'bg-destructive/10 text-destructive'
                        }`}
                      >
                        {isReward ? <Gift className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold truncate">{r.title}</span>
                          <Badge
                            variant="outline"
                            className={
                              isReward
                                ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                                : 'border-destructive/40 text-destructive'
                            }
                          >
                            {isReward ? 'Recompensa' : 'Punição'}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {EFFECT_LABEL[r.effect]}
                            {r.value != null && (r.effect === 'discount_percent') ? ` ${r.value}%` : ''}
                          </Badge>
                          {!r.is_active && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Inativo
                            </Badge>
                          )}
                        </div>
                        {r.description && (
                          <div className="text-xs text-muted-foreground mt-0.5">{r.description}</div>
                        )}
                        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                          {r.scope === 'customer' ? (
                            <>
                              <span>Cliente:</span>
                              <span className="font-medium text-foreground">
                                {customerName(r.customer_id)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span>Faixa:</span>
                              <Badge
                                variant="outline"
                                style={{
                                  borderColor: tierColor(r.tier_id),
                                  color: tierColor(r.tier_id),
                                }}
                                className="text-[10px]"
                              >
                                {tierName(r.tier_id)}
                              </Badge>
                            </>
                          )}
                          {(r.starts_at || r.ends_at) && (
                            <span className="ml-2">
                              · {r.starts_at ? new Date(r.starts_at).toLocaleDateString('pt-BR') : '∞'}
                              {' → '}
                              {r.ends_at ? new Date(r.ends_at).toLocaleDateString('pt-BR') : '∞'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleActive(r)}
                          title={r.is_active ? 'Desativar' : 'Ativar'}
                        >
                          {r.is_active ? '🟢' : '⚪'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => remove(r.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">
                {editing.id ? 'Editar' : 'Novo'} {editing.kind === 'reward' ? 'recompensa' : 'punição'}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select
                  value={editing.kind}
                  onValueChange={(v: Kind) => setEditing({ ...editing, kind: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reward">🎁 Recompensa</SelectItem>
                    <SelectItem value="punishment">🚫 Punição</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Aplicar a</Label>
                <Select
                  value={editing.scope}
                  onValueChange={(v: Scope) =>
                    setEditing({
                      ...editing,
                      scope: v,
                      customer_id: v === 'customer' ? editing.customer_id : null,
                      tier_id: v === 'tier' ? editing.tier_id : null,
                    })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Cliente específico</SelectItem>
                    <SelectItem value="tier">Faixa de clientes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editing.scope === 'tier' ? (
              <div>
                <Label className="text-xs">Faixa</Label>
                <Select
                  value={editing.tier_id || ''}
                  onValueChange={(v) => setEditing({ ...editing, tier_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {tiers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span style={{ color: t.color }}>● </span>{t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label className="text-xs">Cliente</Label>
                <Input
                  placeholder="Buscar cliente por nome ou documento..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="mb-1"
                />
                <div className="border rounded-md max-h-40 overflow-auto divide-y">
                  {filteredCustomers.map((c) => {
                    const active = editing.customer_id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setEditing({ ...editing, customer_id: c.id })}
                        className={`w-full text-left px-2 py-1.5 text-sm hover:bg-muted/50 ${
                          active ? 'bg-primary/10 font-semibold' : ''
                        }`}
                      >
                        {c.company_name || c.full_name}
                        <span className="text-xs text-muted-foreground ml-2">
                          {c.cnpj || c.cpf || ''}
                        </span>
                      </button>
                    );
                  })}
                  {filteredCustomers.length === 0 && (
                    <div className="p-3 text-xs text-muted-foreground text-center">
                      Nenhum cliente encontrado.
                    </div>
                  )}
                </div>
                {editing.customer_id && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Selecionado: <span className="font-semibold text-foreground">{customerName(editing.customer_id)}</span>
                  </div>
                )}
              </div>
            )}

            <div>
              <Label className="text-xs">Título</Label>
              <Input
                value={editing.title || ''}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="Ex.: Brinde de aniversário, Bloqueio por calote..."
              />
            </div>

            <div>
              <Label className="text-xs">Descrição (opcional)</Label>
              <Textarea
                rows={2}
                value={editing.description || ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="Detalhes do que será aplicado..."
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Efeito</Label>
                <Select
                  value={editing.effect}
                  onValueChange={(v: Effect) => setEditing({ ...editing, effect: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discount_percent">Desconto %</SelectItem>
                    <SelectItem value="free_gift">Brinde</SelectItem>
                    <SelectItem value="block_purchase">Bloquear venda</SelectItem>
                    <SelectItem value="block_discount">Bloquear desconto</SelectItem>
                    <SelectItem value="note">Apenas anotação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">
                  Valor {editing.effect === 'discount_percent' ? '(%)' : '(opcional)'}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editing.value ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      value: e.target.value === '' ? null : parseFloat(e.target.value),
                    })
                  }
                  disabled={!['discount_percent', 'free_gift'].includes(editing.effect || '')}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Início (opcional)</Label>
                <Input
                  type="date"
                  value={editing.starts_at ? editing.starts_at.slice(0, 10) : ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      starts_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Fim (opcional)</Label>
                <Input
                  type="date"
                  value={editing.ends_at ? editing.ends_at.slice(0, 10) : ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      ends_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.is_active ?? true}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
              />
              Ativo
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Salvar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
