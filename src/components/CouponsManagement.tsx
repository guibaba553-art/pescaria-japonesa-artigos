import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Pencil, Trash2, Ticket, Loader2, Copy, Percent, DollarSign, Truck } from 'lucide-react';

type CouponType = 'percent' | 'fixed' | 'free_shipping';
type CouponScope = 'site' | 'pdv' | 'both';

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  type: CouponType;
  value: number;
  min_purchase: number;
  max_discount: number | null;
  scope: CouponScope;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  usage_limit_per_user: number | null;
  usage_count: number;
  is_active: boolean;
}

const empty: Partial<Coupon> = {
  code: '',
  description: '',
  type: 'percent',
  value: 10,
  min_purchase: 0,
  max_discount: null,
  scope: 'both',
  starts_at: null,
  ends_at: null,
  usage_limit: null,
  usage_limit_per_user: 1,
  is_active: true,
};

const typeLabel: Record<CouponType, string> = {
  percent: '% desconto',
  fixed: 'R$ fixo',
  free_shipping: 'Frete grátis',
};

const typeIcon: Record<CouponType, typeof Percent> = {
  percent: Percent,
  fixed: DollarSign,
  free_shipping: Truck,
};

const scopeLabel: Record<CouponScope, string> = {
  site: 'Apenas Site',
  pdv: 'Apenas PDV',
  both: 'Site + PDV',
};

const formatDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
};
const toIso = (date: string) => (date ? new Date(date + 'T00:00:00').toISOString() : null);

export function CouponsManagement() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Coupon> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Erro ao carregar cupons', description: error.message, variant: 'destructive' });
    } else {
      setCoupons(data as Coupon[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!editing?.code?.trim()) {
      toast({ title: 'Código é obrigatório', variant: 'destructive' });
      return;
    }
    if (editing.type !== 'free_shipping' && (!editing.value || editing.value <= 0)) {
      toast({ title: 'Valor do desconto deve ser maior que zero', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      code: editing.code.trim().toUpperCase(),
      description: editing.description || null,
      type: editing.type as CouponType,
      value: editing.type === 'free_shipping' ? 0 : Number(editing.value),
      min_purchase: Number(editing.min_purchase) || 0,
      max_discount: editing.max_discount ? Number(editing.max_discount) : null,
      scope: editing.scope as CouponScope,
      starts_at: editing.starts_at,
      ends_at: editing.ends_at,
      usage_limit: editing.usage_limit ? Number(editing.usage_limit) : null,
      usage_limit_per_user: editing.usage_limit_per_user ? Number(editing.usage_limit_per_user) : null,
      is_active: editing.is_active ?? true,
    };

    const { error } = editing.id
      ? await supabase.from('coupons').update(payload).eq('id', editing.id)
      : await supabase.from('coupons').insert(payload);

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: editing.id ? 'Cupom atualizado' : 'Cupom criado' });
      setOpen(false);
      setEditing(null);
      load();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este cupom?')) return;
    const { error } = await supabase.from('coupons').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Cupom excluído' });
      load();
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: 'Código copiado!' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {coupons.length} cupons cadastrados
        </div>
        <Button onClick={() => { setEditing({ ...empty }); setOpen(true); }} className="rounded-full">
          <Plus className="w-4 h-4 mr-2" /> Novo Cupom
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : coupons.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Ticket className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhum cupom cadastrado</p>
            <p className="text-xs mt-1">Crie cupons para oferecer descontos no site e no PDV.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {coupons.map((c) => {
            const Icon = typeIcon[c.type];
            const expired = c.ends_at && new Date(c.ends_at) < new Date();
            const exhausted = c.usage_limit && c.usage_count >= c.usage_limit;
            return (
              <Card key={c.id} className={!c.is_active || expired ? 'opacity-60' : ''}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <code className="font-display font-black text-lg tracking-wide">{c.code}</code>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyCode(c.code)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                      {c.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">{c.description}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <Icon className="w-3 h-3" />
                      {c.type === 'percent' && `${c.value}%`}
                      {c.type === 'fixed' && `R$ ${c.value}`}
                      {c.type === 'free_shipping' && 'Frete grátis'}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{scopeLabel[c.scope]}</Badge>
                    {!c.is_active && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                    {expired && <Badge variant="destructive" className="text-[10px]">Expirado</Badge>}
                    {exhausted && <Badge variant="destructive" className="text-[10px]">Esgotado</Badge>}
                  </div>

                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {c.min_purchase > 0 && <div>Mín: R$ {c.min_purchase.toFixed(2)}</div>}
                    {c.ends_at && <div>Expira: {new Date(c.ends_at).toLocaleDateString('pt-BR')}</div>}
                    <div>Usos: {c.usage_count}{c.usage_limit ? ` / ${c.usage_limit}` : ''}</div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditing(c); setOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                    </Button>
                    {isAdmin && (
                      <Button size="sm" variant="outline" onClick={() => handleDelete(c.id)} className="text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar Cupom' : 'Novo Cupom'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Código *</Label>
                <Input
                  value={editing.code || ''}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                  placeholder="EX: BEMVINDO10"
                  className="font-mono uppercase"
                />
              </div>
              <div>
                <Label>Tipo *</Label>
                <Select value={editing.type} onValueChange={(v: CouponType) => setEditing({ ...editing, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">% desconto no total</SelectItem>
                    <SelectItem value="fixed">R$ fixo de desconto</SelectItem>
                    <SelectItem value="free_shipping">Frete grátis</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editing.type !== 'free_shipping' && (
                <div>
                  <Label>{editing.type === 'percent' ? 'Percentual (%)' : 'Valor (R$)'}</Label>
                  <Input
                    type="number"
                    min={0}
                    step={editing.type === 'percent' ? 1 : 0.01}
                    value={editing.value ?? 0}
                    onChange={(e) => setEditing({ ...editing, value: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              )}

              {editing.type === 'percent' && (
                <div>
                  <Label>Desconto máximo (R$ opcional)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={editing.max_discount ?? ''}
                    onChange={(e) => setEditing({ ...editing, max_discount: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="Sem teto"
                  />
                </div>
              )}

              <div>
                <Label>Valor mínimo de compra (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editing.min_purchase ?? 0}
                  onChange={(e) => setEditing({ ...editing, min_purchase: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div>
                <Label>Onde vale</Label>
                <Select value={editing.scope} onValueChange={(v: CouponScope) => setEditing({ ...editing, scope: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Site e PDV</SelectItem>
                    <SelectItem value="site">Apenas Site</SelectItem>
                    <SelectItem value="pdv">Apenas PDV</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Início (opcional)</Label>
                <Input type="date" value={formatDate(editing.starts_at ?? null)} onChange={(e) => setEditing({ ...editing, starts_at: toIso(e.target.value) })} />
              </div>
              <div>
                <Label>Fim (opcional)</Label>
                <Input type="date" value={formatDate(editing.ends_at ?? null)} onChange={(e) => setEditing({ ...editing, ends_at: toIso(e.target.value) })} />
              </div>

              <div>
                <Label>Limite total de usos</Label>
                <Input
                  type="number"
                  min={1}
                  value={editing.usage_limit ?? ''}
                  onChange={(e) => setEditing({ ...editing, usage_limit: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Ilimitado"
                />
              </div>
              <div>
                <Label>Usos por cliente</Label>
                <Input
                  type="number"
                  min={1}
                  value={editing.usage_limit_per_user ?? ''}
                  onChange={(e) => setEditing({ ...editing, usage_limit_per_user: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Ilimitado"
                />
              </div>

              <div className="sm:col-span-2">
                <Label>Descrição (opcional)</Label>
                <Textarea rows={2} value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Ex: Cupom de boas-vindas" />
              </div>

              <div className="sm:col-span-2 flex items-center justify-between border rounded-md px-3 py-2">
                <div>
                  <Label className="cursor-pointer">Ativo</Label>
                  <p className="text-xs text-muted-foreground">Cupom disponível para uso</p>
                </div>
                <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setEditing(null); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
