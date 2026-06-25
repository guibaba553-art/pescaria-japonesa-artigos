import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2, ShoppingBag, Calendar, CreditCard, Package, TrendingUp, Receipt,
  User as UserIcon, Mail, Phone, MapPin, FileText, Award, Gift, Pencil,
  CheckCircle2, AlertTriangle, History, Sparkles, IdCard,
} from 'lucide-react';
import { getTierForScore, type CustomerTier } from '@/utils/customerTiers';

interface CustomerLite {
  id: string;
  full_name: string;
  cpf: string | null;
  cnpj: string | null;
  company_name: string | null;
  email: string | null;
  phone?: string | null;
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  complemento: string | null;
  municipio: string | null;
  uf: string | null;
  codigo_municipio_ibge: string | null;
  inscricao_estadual: string | null;
  ie_indicador: string | null;
  score: number;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: CustomerLite | null;
  tiers: CustomerTier[];
  fiscalValid: { ok: boolean; missing: string[] };
  onEdit: (c: CustomerLite) => void;
  onManageScore: (c: CustomerLite) => void;
  onManageRewards: (c: CustomerLite) => void;
}

interface OrderRow {
  id: string;
  total_amount: number;
  status: string;
  created_at: string;
  source: string | null;
  payment_method: string | null;
  installments: number | null;
  notes: string | null;
  items: Array<{ name: string; quantity: number; price_at_purchase: number; variation_name?: string | null }>;
}

interface ScoreEvent {
  id: string;
  points_delta: number;
  reason: string;
  source: string;
  created_at: string;
  order_id: string | null;
}

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const statusLabel: Record<string, string> = {
  aguardando_pagamento: 'Aguardando pagamento',
  em_preparo: 'Em preparo',
  aguardando_envio: 'Aguardando envio',
  enviado: 'Enviado',
  entregado: 'Entregue',
  retirado: 'Retirado',
  cancelado: 'Cancelado',
  devolucao_solicitada: 'Devolução solicitada',
  devolvido: 'Devolvido',
};

const statusColor = (s: string): string => {
  if (['entregado', 'retirado'].includes(s)) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
  if (['cancelado', 'devolvido'].includes(s)) return 'bg-destructive/15 text-destructive border-destructive/30';
  if (s === 'enviado') return 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30';
  return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
};

const payLabel = (m?: string | null) => {
  if (!m) return '—';
  const k = m.toLowerCase();
  if (k.includes('pix')) return 'PIX';
  if (k.includes('credit') || k === 'credito' || k === 'crédito') return 'Crédito';
  if (k.includes('debit') || k === 'debito' || k === 'débito') return 'Débito';
  if (k.includes('cash') || k.includes('dinheiro')) return 'Dinheiro';
  return m;
};

export function CustomerDetailsDialog({
  open, onOpenChange, customer, tiers, fiscalValid,
  onEdit, onManageScore, onManageRewards,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [events, setEvents] = useState<ScoreEvent[]>([]);

  useEffect(() => {
    if (!open || !customer) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: ords }, { data: evs }] = await Promise.all([
          supabase
            .from('orders')
            .select('id,total_amount,status,created_at,source,payment_method,installments,notes,customer_id,user_id')
            .or(`customer_id.eq.${customer.id},user_id.eq.${customer.id}`)
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('customer_score_events')
            .select('id,points_delta,reason,source,created_at,order_id')
            .eq('customer_id', customer.id)
            .order('created_at', { ascending: false })
            .limit(100),
        ]);

        const ids = (ords || []).map((o: any) => o.id);
        let itemsByOrder: Record<string, OrderRow['items']> = {};
        if (ids.length) {
          const { data: items } = await supabase
            .from('order_items')
            .select('order_id,quantity,price_at_purchase,product_id,variation_id')
            .in('order_id', ids);

          const productIds = Array.from(new Set((items || []).map((i: any) => i.product_id).filter(Boolean)));
          const variationIds = Array.from(new Set((items || []).map((i: any) => i.variation_id).filter(Boolean)));

          const [{ data: prods }, { data: vars }] = await Promise.all([
            productIds.length
              ? supabase.from('products').select('id,name').in('id', productIds)
              : Promise.resolve({ data: [] as any[] }),
            variationIds.length
              ? supabase.from('product_variations').select('id,name').in('id', variationIds)
              : Promise.resolve({ data: [] as any[] }),
          ]);

          const pMap = new Map((prods || []).map((p: any) => [p.id, p.name]));
          const vMap = new Map((vars || []).map((v: any) => [v.id, v.name]));

          (items || []).forEach((it: any) => {
            const arr = itemsByOrder[it.order_id] || (itemsByOrder[it.order_id] = []);
            arr.push({
              name: pMap.get(it.product_id) || 'Produto',
              quantity: Number(it.quantity || 0),
              price_at_purchase: Number(it.price_at_purchase || 0),
              variation_name: it.variation_id ? vMap.get(it.variation_id) : null,
            });
          });
        }

        if (cancel) return;
        setOrders((ords || []).map((o: any) => ({
          id: o.id,
          total_amount: Number(o.total_amount || 0),
          status: o.status,
          created_at: o.created_at,
          source: o.source,
          payment_method: o.payment_method,
          installments: o.installments,
          notes: o.notes,
          items: itemsByOrder[o.id] || [],
        })));
        setEvents((evs || []) as ScoreEvent[]);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [open, customer]);

  const stats = useMemo(() => {
    const valid = orders.filter((o) => !['cancelado', 'devolvido'].includes(o.status));
    const total = valid.reduce((s, o) => s + o.total_amount, 0);
    const items = valid.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
    const avg = valid.length ? total / valid.length : 0;
    const last = orders[0]?.created_at;
    return { count: valid.length, total, items, avg, last };
  }, [orders]);

  if (!customer) return null;
  const c = customer;
  const tier = getTierForScore(tiers, c.score || 0);
  const isPJ = !!c.cnpj;
  const displayName = isPJ && c.company_name ? c.company_name : c.full_name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] p-0 overflow-hidden flex flex-col gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-br from-muted/40 to-transparent shrink-0">
          <div className="flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl shrink-0 shadow-sm"
              style={{ backgroundColor: tier?.color || '#64748b' }}
            >
              {(displayName || '?').trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl truncate">{displayName}</DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant={isPJ ? 'default' : 'secondary'} className="text-[10px]">
                  {isPJ ? 'PJ · CNPJ' : 'PF · CPF'}
                </Badge>
                <Badge
                  className="gap-1 text-white border-0 text-[10px]"
                  style={{ backgroundColor: tier?.color || '#64748b' }}
                >
                  <Award className="w-3 h-3" /> {tier?.name || 'Sem faixa'} · {c.score || 0} pts
                </Badge>
                {stats.count > 0 && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <ShoppingBag className="w-3 h-3" /> {stats.count} compras · {BRL(stats.total)}
                  </Badge>
                )}
              </DialogDescription>
            </div>
            <div className="hidden sm:flex flex-col gap-1.5 shrink-0">
              <Button size="sm" variant="outline" onClick={() => onEdit(c)}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar
              </Button>
              <Button size="sm" variant="outline" onClick={() => onManageScore(c)}>
                <Award className="w-3.5 h-3.5 mr-1.5" /> Pontos
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 pt-3 border-b shrink-0">
            <TabsList className="bg-transparent p-0 h-auto gap-1">
              <TabsTrigger value="overview" className="data-[state=active]:bg-muted gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Visão geral
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-muted gap-1.5">
                <History className="w-3.5 h-3.5" /> Histórico
                {orders.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{orders.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="points" className="data-[state=active]:bg-muted gap-1.5">
                <Award className="w-3.5 h-3.5" /> Pontuação
              </TabsTrigger>
              <TabsTrigger value="fiscal" className="data-[state=active]:bg-muted gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Fiscal
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-full py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ScrollArea className="h-full">
                {/* ============ Visão geral ============ */}
                <TabsContent value="overview" className="m-0 p-6 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard icon={<Receipt className="w-4 h-4" />} label="Compras" value={String(stats.count)} />
                    <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Total gasto" value={BRL(stats.total)} />
                    <StatCard icon={<Package className="w-4 h-4" />} label="Itens" value={String(stats.items)} />
                    <StatCard icon={<CreditCard className="w-4 h-4" />} label="Ticket médio" value={BRL(stats.avg)} />
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <Section title="Dados pessoais" icon={<UserIcon className="w-4 h-4" />}>
                      <InfoRow icon={<UserIcon className="w-3.5 h-3.5" />} label="Nome" value={c.full_name} />
                      {isPJ && c.company_name && (
                        <InfoRow icon={<IdCard className="w-3.5 h-3.5" />} label="Razão social" value={c.company_name} />
                      )}
                      <InfoRow
                        icon={<IdCard className="w-3.5 h-3.5" />}
                        label={isPJ ? 'CNPJ' : 'CPF'}
                        value={(isPJ ? c.cnpj : c.cpf) || '—'}
                        mono
                      />
                      <InfoRow icon={<Mail className="w-3.5 h-3.5" />} label="E-mail" value={c.email || '—'} />
                      <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label="Telefone" value={c.phone || '—'} />
                      <InfoRow
                        icon={<Calendar className="w-3.5 h-3.5" />}
                        label="Cadastro"
                        value={new Date(c.created_at).toLocaleDateString('pt-BR')}
                      />
                    </Section>

                    <Section title="Endereço" icon={<MapPin className="w-4 h-4" />}>
                      {c.cep || c.street ? (
                        <>
                          <InfoRow label="CEP" value={c.cep || '—'} mono />
                          <InfoRow label="Logradouro" value={`${c.street || '—'}, ${c.number || 's/n'}`} />
                          {c.complemento && <InfoRow label="Compl." value={c.complemento} />}
                          <InfoRow label="Bairro" value={c.neighborhood || '—'} />
                          <InfoRow label="Cidade/UF" value={`${c.municipio || '—'}${c.uf ? ` / ${c.uf}` : ''}`} />
                          {c.codigo_municipio_ibge && (
                            <InfoRow label="IBGE" value={c.codigo_municipio_ibge} mono />
                          )}
                        </>
                      ) : (
                        <div className="text-xs text-muted-foreground italic py-2">
                          Endereço não informado.
                        </div>
                      )}
                    </Section>
                  </div>

                  {orders.length > 0 && (
                    <Section title="Últimas compras" icon={<History className="w-4 h-4" />}>
                      <div className="space-y-1.5">
                        {orders.slice(0, 5).map((o) => (
                          <div key={o.id} className="flex items-center justify-between text-xs gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground shrink-0">
                                {new Date(o.created_at).toLocaleDateString('pt-BR')}
                              </span>
                              <Badge variant="outline" className={`${statusColor(o.status)} text-[10px] h-5`}>
                                {statusLabel[o.status] || o.status}
                              </Badge>
                              <span className="text-muted-foreground truncate">
                                {o.items.length} {o.items.length === 1 ? 'item' : 'itens'}
                              </span>
                            </div>
                            <span className="font-mono font-semibold shrink-0">{BRL(o.total_amount)}</span>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}
                </TabsContent>

                {/* ============ Histórico ============ */}
                <TabsContent value="history" className="m-0 p-6 space-y-3">
                  {orders.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-12">
                      Nenhuma compra encontrada para este cliente.
                    </div>
                  ) : (
                    orders.map((o) => (
                      <div key={o.id} className="rounded-xl border bg-card p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Calendar className="w-3.5 h-3.5" />
                              {new Date(o.created_at).toLocaleString('pt-BR')}
                              <span className="font-mono">#{o.id.slice(0, 8)}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className={statusColor(o.status)}>
                                {statusLabel[o.status] || o.status}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px]">
                                {o.source === 'pdv' ? 'PDV' : 'Site'}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <CreditCard className="w-3 h-3" />
                                {payLabel(o.payment_method)}
                                {o.installments && o.installments > 1 ? ` ${o.installments}x` : ''}
                              </Badge>
                            </div>
                          </div>
                          <div className="text-lg font-bold text-primary">{BRL(o.total_amount)}</div>
                        </div>
                        {o.items.length > 0 && (
                          <div className="border-t pt-2 space-y-1">
                            {o.items.map((it, idx) => (
                              <div key={idx} className="flex items-center justify-between text-xs">
                                <span className="truncate flex-1">
                                  <span className="font-medium text-muted-foreground mr-1">{it.quantity}×</span>
                                  {it.name}
                                  {it.variation_name && <span className="text-muted-foreground"> · {it.variation_name}</span>}
                                </span>
                                <span className="font-mono text-muted-foreground ml-2">
                                  {BRL(it.price_at_purchase * it.quantity)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {o.notes && (
                          <div className="text-xs text-muted-foreground italic border-t pt-2">{o.notes}</div>
                        )}
                      </div>
                    ))
                  )}
                </TabsContent>

                {/* ============ Pontuação ============ */}
                <TabsContent value="points" className="m-0 p-6 space-y-4">
                  <div className="rounded-xl border p-4 bg-gradient-to-br from-muted/40 to-transparent flex items-center gap-4">
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: tier?.color || '#64748b' }}
                    >
                      <Award className="w-8 h-8" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Faixa atual</div>
                      <div className="text-xl font-bold truncate">{tier?.name || 'Sem faixa'}</div>
                      <div className="text-sm text-muted-foreground">{c.score || 0} pontos acumulados</div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => onManageScore(c)}>
                        <Award className="w-3.5 h-3.5 mr-1.5" /> Ajustar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onManageRewards(c)}>
                        <Gift className="w-3.5 h-3.5 mr-1.5" /> Recompensas
                      </Button>
                    </div>
                  </div>

                  <Section title="Histórico de pontos" icon={<History className="w-4 h-4" />}>
                    {events.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic py-3 text-center">
                        Nenhum evento de pontuação registrado.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {events.map((ev) => (
                          <div key={ev.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b last:border-0">
                            <div className="min-w-0 flex-1">
                              <div className="truncate">{ev.reason}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {new Date(ev.created_at).toLocaleString('pt-BR')} · {ev.source}
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={
                                ev.points_delta >= 0
                                  ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400 font-mono'
                                  : 'border-destructive/40 text-destructive font-mono'
                              }
                            >
                              {ev.points_delta > 0 ? '+' : ''}{ev.points_delta} pts
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                </TabsContent>

                {/* ============ Fiscal ============ */}
                <TabsContent value="fiscal" className="m-0 p-6 space-y-4">
                  {isPJ ? (
                    <div className={`rounded-xl border p-4 ${fiscalValid.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-destructive/40 bg-destructive/5'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-semibold flex items-center gap-2">
                          <FileText className="w-4 h-4" /> Dados fiscais — NF-e
                        </div>
                        {fiscalValid.ok ? (
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400 gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Aprovado
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="w-3 h-3" /> Bloqueado
                          </Badge>
                        )}
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <InfoRow label="CNPJ" value={c.cnpj || '—'} mono />
                        <InfoRow label="Razão social" value={c.company_name || '—'} />
                        <InfoRow label="IE" value={c.inscricao_estadual || '—'} mono />
                        <InfoRow label="Ind. IE" value={c.ie_indicador || '—'} />
                        <InfoRow label="Endereço" value={c.street ? `${c.street}, ${c.number || 's/n'} — ${c.neighborhood || ''}` : '—'} />
                        <InfoRow label="Cidade/UF" value={`${c.municipio || '—'}${c.uf ? ` / ${c.uf}` : ''}`} />
                        <InfoRow label="CEP" value={c.cep || '—'} mono />
                        <InfoRow label="IBGE" value={c.codigo_municipio_ibge || '—'} mono />
                      </div>
                      {!fiscalValid.ok && (
                        <div className="mt-3 pt-3 border-t border-destructive/20">
                          <div className="text-xs font-semibold text-destructive mb-1.5">Pendências:</div>
                          <div className="flex flex-wrap gap-1">
                            {fiscalValid.missing.map((m) => (
                              <Badge key={m} variant="outline" className="border-destructive/40 text-destructive font-normal text-[10px] h-5">
                                {m}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border p-4 bg-muted/20">
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-semibold flex items-center gap-2">
                          <FileText className="w-4 h-4" /> Dados fiscais — NFC-e
                        </div>
                        <Badge variant="outline">Pessoa física</Badge>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <InfoRow label="CPF" value={c.cpf || '—'} mono />
                        <InfoRow label="Nome" value={c.full_name} />
                        <InfoRow label="E-mail" value={c.email || '—'} />
                        <InfoRow label="Telefone" value={c.phone || '—'} />
                      </div>
                      <div className="mt-3 text-xs text-muted-foreground">
                        Pessoa física não exige endereço completo para emissão de NFC-e.
                      </div>
                    </div>
                  )}
                </TabsContent>
              </ScrollArea>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background border p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-bold truncate">{value}</div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2.5">
        {icon} {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function InfoRow({ icon, label, value, mono }: { icon?: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <div className="text-muted-foreground min-w-[90px] flex items-center gap-1 shrink-0">
        {icon}
        {label}
      </div>
      <div className={`flex-1 min-w-0 break-words ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
