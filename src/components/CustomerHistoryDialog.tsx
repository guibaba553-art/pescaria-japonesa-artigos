import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShoppingBag, Calendar, CreditCard, Package, TrendingUp, Receipt } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  customerName?: string;
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

export function CustomerHistoryDialog({ open, onOpenChange, customerId, customerName }: Props) {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  useEffect(() => {
    if (!open || !customerId) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const { data: ords, error } = await supabase
          .from('orders')
          .select('id,total_amount,status,created_at,source,payment_method,installments,notes,customer_id,user_id')
          .or(`customer_id.eq.${customerId},user_id.eq.${customerId}`)
          .order('created_at', { ascending: false })
          .limit(200);
        if (error) throw error;

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
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [open, customerId]);

  const stats = useMemo(() => {
    const valid = orders.filter((o) => !['cancelado', 'devolvido'].includes(o.status));
    const total = valid.reduce((s, o) => s + o.total_amount, 0);
    const items = valid.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
    const avg = valid.length ? total / valid.length : 0;
    return { count: valid.length, total, items, avg };
  }, [orders]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" />
            Histórico de compras
          </DialogTitle>
          <DialogDescription className="truncate">
            {customerName || 'Cliente'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3 border-b bg-muted/30 shrink-0">
              <StatCard icon={<Receipt className="w-4 h-4" />} label="Compras" value={String(stats.count)} />
              <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Total gasto" value={BRL(stats.total)} />
              <StatCard icon={<Package className="w-4 h-4" />} label="Itens" value={String(stats.items)} />
              <StatCard icon={<CreditCard className="w-4 h-4" />} label="Ticket médio" value={BRL(stats.avg)} />
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="px-6 py-4 space-y-3">
                {orders.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-12">
                    Nenhuma compra encontrada para este cliente.
                  </div>
                ) : (
                  orders.map((o) => (
                    <div key={o.id} className="rounded-xl border bg-card p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="space-y-0.5">
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
                        <div className="text-right">
                          <div className="text-lg font-bold text-primary">{BRL(o.total_amount)}</div>
                        </div>
                      </div>

                      {o.items.length > 0 && (
                        <div className="border-t pt-2 space-y-1">
                          {o.items.map((it, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <span className="truncate flex-1">
                                <span className="font-medium text-muted-foreground mr-1">{it.quantity}×</span>
                                {it.name}
                                {it.variation_name ? <span className="text-muted-foreground"> · {it.variation_name}</span> : null}
                              </span>
                              <span className="font-mono text-muted-foreground ml-2">
                                {BRL(it.price_at_purchase * it.quantity)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {o.notes && (
                        <div className="text-xs text-muted-foreground italic border-t pt-2">
                          {o.notes}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </>
        )}
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
