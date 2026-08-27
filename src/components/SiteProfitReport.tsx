import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { calcBaseCost } from '@/lib/pricing';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';


export interface SiteProfitItem {
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  revenue: number;
  cost: number;
  profit: number;
}

export interface SiteProfitOrder {
  id: string;
  createdAt: string;
  status: string;
  source?: string | null;
  paymentMethod?: string | null;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  items: SiteProfitItem[];
}


const ALL_FINALIZED = ['entregado', 'retirado', 'pronto_retirada', 'em_preparo', 'enviado'] as const;
const SITE_FINALIZED = ['entregado', 'retirado', 'pronto_retirada', 'em_preparo', 'enviado'] as const;
const PDV_FINALIZED = ['entregado', 'retirado', 'pronto_retirada'] as const;

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function SiteProfitReport({
  rangeStart,
  rangeEnd,
  onTotals,
  channel = 'site',
}: {
  rangeStart?: Date;
  rangeEnd?: Date;
  onTotals?: (totals: { revenue: number; cost: number; profit: number }) => void;
  channel?: 'site' | 'pdv' | 'all';
}) {
  const isPdv = channel === 'pdv';
  const isAll = channel === 'all';
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<SiteProfitOrder[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!rangeStart || !rangeEnd) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const startISO = new Date(
          rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate(), 0, 0, 0,
        ).toISOString();
        const endISO = new Date(
          rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate(), 23, 59, 59,
        ).toISOString();

        const PAGE = 1000;
        const ordersData: any[] = [];
        for (let from = 0; ; from += PAGE) {
          let query = supabase
            .from('orders')
            .select('id, created_at, status, total_amount, shipping_cost, source, payment_method');
          if (!isAll) query = isPdv ? query.eq('source', 'pdv') : query.neq('source', 'pdv');

          const { data, error } = await query
            .in('status', (isAll ? ALL_FINALIZED : isPdv ? PDV_FINALIZED : SITE_FINALIZED) as any)
            .gte('created_at', startISO)
            .lte('created_at', endISO)
            .order('created_at', { ascending: false })
            .range(from, from + PAGE - 1);
          if (error) throw error;
          ordersData.push(...(data || []));
          if (!data || data.length < PAGE) break;
        }

        const ids = ordersData.map((o) => o.id);
        const items: any[] = [];
        for (let i = 0; i < ids.length; i += 100) {
          const chunk = ids.slice(i, i + 100);
          if (chunk.length === 0) break;
          for (let from = 0; ; from += PAGE) {
            const { data } = await supabase
              .from('order_items')
              .select('order_id, quantity, price_at_purchase, product_id, variation_id')
              .in('order_id', chunk)
              .range(from, from + PAGE - 1);
            if (data) items.push(...data);
            if (!data || data.length < PAGE) break;
          }
        }

        const productMap = new Map<string, any>();
        const variationMap = new Map<string, any>();
        if (items.length > 0) {
          const [prodRes, varRes] = await Promise.all([
            supabase.rpc('get_products_admin'),
            supabase.rpc('get_product_variations_admin'),
          ]);
          (prodRes.data || []).forEach((p: any) => productMap.set(p.id, p));
          (varRes.data || []).forEach((v: any) => variationMap.set(v.id, v));
        }

        const byOrder = new Map<string, SiteProfitItem[]>();
        items.forEach((it: any) => {
          const qty = Number(it.quantity || 0);
          const unitPrice = Number(it.price_at_purchase || 0);
          const variationInfo = it.variation_id ? variationMap.get(it.variation_id) : undefined;
          const productInfo = productMap.get(it.product_id);
          const useVariation = variationInfo != null && Number(variationInfo.cost ?? 0) > 0;
          const rawCost = Number(useVariation ? variationInfo.cost : (productInfo?.cost ?? 0));
          const src = useVariation ? variationInfo : productInfo;
          const freightPct = Number(src?.freight_pct ?? productInfo?.freight_pct ?? 0);
          const opCostPct = Number(src?.op_cost_pct ?? productInfo?.op_cost_pct ?? 0);
          // Custo total = custo + frete + custos operacionais (mesma base do cadastro)
          const unitCost = calcBaseCost(rawCost, freightPct, opCostPct);

          const name = it.variation_id && variationInfo?.name
            ? `${productInfo?.name || 'Produto'} — ${variationInfo.name}`
            : productInfo?.name || 'Produto';
          const revenue = unitPrice * qty;
          const cost = unitCost * qty;
          const list = byOrder.get(it.order_id) || [];
          list.push({ name, quantity: qty, unitPrice, unitCost, revenue, cost, profit: revenue - cost });
          byOrder.set(it.order_id, list);
        });

        const result: SiteProfitOrder[] = (ordersData || []).map((o: any) => {
          const list = byOrder.get(o.id) || [];
          const revenue = list.reduce((s, i) => s + i.revenue, 0)
            || Number(o.total_amount || 0) - Number(o.shipping_cost || 0);
          const cost = list.reduce((s, i) => s + i.cost, 0);
          const profit = revenue - cost;
          return {
            id: o.id,
            createdAt: o.created_at,
            status: o.status,
            source: o.source ?? null,
            paymentMethod: o.payment_method ?? null,
            revenue,

            cost,
            profit,
            margin: revenue > 0 ? (profit / revenue) * 100 : 0,
            items: list,
          };
        });

        if (cancelled) return;
        setOrders(result);
        onTotals?.({
          revenue: result.reduce((s, o) => s + o.revenue, 0),
          cost: result.reduce((s, o) => s + o.cost, 0),
          profit: result.reduce((s, o) => s + o.profit, 0),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart?.getTime(), rangeEnd?.getTime(), isPdv, isAll]);

  const totals = useMemo(() => ({
    revenue: orders.reduce((s, o) => s + o.revenue, 0),
    cost: orders.reduce((s, o) => s + o.cost, 0),
    profit: orders.reduce((s, o) => s + o.profit, 0),
  }), [orders]);

  const averages = useMemo(() => {
    const n = orders.length || 1;
    const revenue = totals.revenue / n;
    const cost = totals.cost / n;
    const profit = totals.profit / n;
    const margin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;
    return { revenue, cost, profit, margin };
  }, [orders.length, totals]);

  const chartData = useMemo(() => {
    const byDay = new Map<string, { revenue: number; cost: number; profit: number }>();
    orders.forEach((o) => {
      const d = new Date(o.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const cur = byDay.get(key) || { revenue: 0, cost: 0, profit: 0 };
      cur.revenue += o.revenue;
      cur.cost += o.cost;
      cur.profit += o.profit;
      byDay.set(key, cur);
    });
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => {
        const [y, m, d] = key.split('-');
        return { date: `${d}/${m}/${y}`, ...v };
      });
  }, [orders]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lucro por Venda — {isAll ? 'Vendas Gerais' : isPdv ? 'PDV' : 'Site'}</CardTitle>
        <CardDescription>
          {loading
            ? 'Carregando vendas...'
            : `${orders.length} venda(s) · Receita ${fmt(totals.revenue)} · Custo ${fmt(totals.cost)} · Lucro ${fmt(totals.profit)}`}
          {' '}— clique em uma venda para ver os itens.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : orders.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma venda {isAll ? '' : isPdv ? 'do PDV' : 'do site'} no período.
          </p>
        ) : (
          <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Receita total</p>
              <p className="text-lg font-semibold">{fmt(totals.revenue)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Custo total</p>
              <p className="text-lg font-semibold">{fmt(totals.cost)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Lucro total</p>
              <p className="text-lg font-semibold text-primary">{fmt(totals.profit)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Margem</p>
              <p className="text-lg font-semibold">{totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(1) : '0.0'}%</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Ticket médio</p>
              <p className="text-lg font-semibold">{fmt(averages.revenue)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Custo médio</p>
              <p className="text-lg font-semibold">{fmt(averages.cost)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Lucro médio</p>
              <p className="text-lg font-semibold text-primary">{fmt(averages.profit)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground">Margem média</p>
              <p className="text-lg font-semibold">{averages.margin.toFixed(1)}%</p>
            </div>
          </div>


          {chartData.length > 1 && (
            <div className="rounded-lg border p-3 mb-4">
              <p className="text-sm font-medium mb-2">
                Receita e Lucro Diário — {isAll ? 'Vendas Gerais' : isPdv ? 'PDV' : 'Site'}
              </p>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => fmt(Number(v))} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" name="Receita" strokeWidth={2} />
                  <Line type="monotone" dataKey="profit" stroke="#10b981" name="Lucro" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                  <th className="py-2 w-6" />
                  <th className="py-2">Venda</th>
                  <th className="py-2">Data</th>
                  <th className="py-2 text-right">Valor</th>
                  <th className="py-2 text-right">Custo</th>
                  <th className="py-2 text-right">Lucro</th>
                  <th className="py-2 text-right">Margem</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const open = expanded === o.id;
                  return (
                    <>
                      <tr
                        key={o.id}
                        className="border-b cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpanded(open ? null : o.id)}
                      >
                        <td className="py-2">
                          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="py-2 font-mono text-xs">
                          #{o.id.slice(0, 8)}
                          <Badge variant="outline" className="ml-2 text-[10px]">{o.status}</Badge>
                          {isAll && (
                            <Badge variant="outline" className="ml-1 text-[10px]">
                              {o.source === 'pdv' ? 'PDV' : 'Site'}
                            </Badge>
                          )}
                          {(isPdv || isAll) && o.paymentMethod && (
                            <Badge variant="secondary" className="ml-1 text-[10px]">{o.paymentMethod}</Badge>
                          )}
                        </td>

                        <td className="py-2 whitespace-nowrap">
                          {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="py-2 text-right tabular-nums">{fmt(o.revenue)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">{fmt(o.cost)}</td>
                        <td className={`py-2 text-right tabular-nums font-semibold ${o.profit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                          {fmt(o.profit)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-xs text-muted-foreground">
                          {o.margin.toFixed(1)}%
                        </td>
                      </tr>
                      {open && (
                        <tr key={`${o.id}-items`} className="bg-muted/30">
                          <td />
                          <td colSpan={6} className="py-3 pr-2">
                            {o.items.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Sem itens registrados.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-muted-foreground">
                                    <th className="py-1">Item</th>
                                    <th className="py-1 text-right">Qtd</th>
                                    <th className="py-1 text-right">Preço un.</th>
                                    <th className="py-1 text-right">Custo un.</th>
                                    <th className="py-1 text-right">Total</th>
                                    <th className="py-1 text-right">Lucro</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {o.items.map((it, idx) => (
                                    <tr key={idx} className="border-t border-border/50">
                                      <td className="py-1 pr-2">{it.name}</td>
                                      <td className="py-1 text-right tabular-nums">{it.quantity}</td>
                                      <td className="py-1 text-right tabular-nums">{fmt(it.unitPrice)}</td>
                                      <td className="py-1 text-right tabular-nums">{fmt(it.unitCost)}</td>
                                      <td className="py-1 text-right tabular-nums">{fmt(it.revenue)}</td>
                                      <td className={`py-1 text-right tabular-nums font-medium ${it.profit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                                        {fmt(it.profit)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>

        )}
      </CardContent>
    </Card>
  );
}
