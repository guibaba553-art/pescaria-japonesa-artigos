import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { startOfDay, endOfDay } from 'date-fns';

const COLORS = ['hsl(var(--primary))', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#0ea5e9', '#a855f7'];

interface SourceRow {
  source: string;
  customers: number;
  orders: number;
  revenue: number;
}

function classifySource(ref: string | null): string {
  if (!ref) return 'Direto / App';
  try {
    const host = new URL(ref).hostname.toLowerCase();
    if (host.includes(window.location.hostname)) return 'Direto / App';
    if (host.includes('google')) return 'Google';
    if (host.includes('bing')) return 'Bing';
    if (host.includes('duckduckgo')) return 'DuckDuckGo';
    if (host.includes('yahoo')) return 'Yahoo';
    if (host.includes('facebook') || host.includes('fb.')) return 'Facebook';
    if (host.includes('instagram')) return 'Instagram';
    if (host.includes('whatsapp') || host.includes('wa.me')) return 'WhatsApp';
    if (host.includes('tiktok')) return 'TikTok';
    if (host.includes('youtube')) return 'YouTube';
    if (host.includes('t.co') || host.includes('twitter') || host.includes('x.com')) return 'X / Twitter';
    if (host.includes('mercadolivre') || host.includes('mercadolibre')) return 'Mercado Livre';
    return host.replace('www.', '');
  } catch {
    return 'Outros';
  }
}

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function CustomerSourceReport({ rangeStart, rangeEnd }: { rangeStart?: Date; rangeEnd?: Date }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SourceRow[]>([]);

  const startTime = rangeStart?.getTime();
  const endTime = rangeEnd?.getTime();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const today = new Date();
      const start = startOfDay(rangeStart ?? new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000));
      const end = endOfDay(rangeEnd ?? today);
      const sinceIso = start.toISOString();
      const untilIso = end.toISOString();

      // Apenas pedidos concluídos do site no período
      const { data: orders } = await supabase
        .from('orders')
        .select('user_id, total_amount, created_at')
        .eq('source', 'site')
        .gte('created_at', sinceIso)
        .lte('created_at', untilIso)
        .not('status', 'in', '(cancelado,aguardando_pagamento)');

      const buyerIds = Array.from(
        new Set((orders || []).map((o: any) => o.user_id).filter(Boolean)),
      ) as string[];

      // Histórico de visitas somente dos compradores (atribuição last-touch)
      const buyerSource = new Map<string, string>();
      const CHUNK = 50;
      for (let i = 0; i < buyerIds.length; i += CHUNK) {
        const chunk = buyerIds.slice(i, i + CHUNK);
        const { data: visits } = await supabase
          .from('site_visits')
          .select('referrer, user_id, created_at')
          .in('user_id', chunk)
          .order('created_at', { ascending: true })
          .limit(5000);
        for (const v of visits || []) {
          if (!v.user_id) continue;
          buyerSource.set(v.user_id, classifySource(v.referrer));
        }
      }

      const map = new Map<string, SourceRow>();
      const get = (source: string) => {
        let r = map.get(source);
        if (!r) {
          r = { source, customers: 0, orders: 0, revenue: 0 };
          map.set(source, r);
        }
        return r;
      };

      const countedBuyers = new Set<string>();
      for (const o of orders || []) {
        const source = (o.user_id && buyerSource.get(o.user_id)) || 'Não identificado';
        const r = get(source);
        r.orders += 1;
        r.revenue += Number(o.total_amount || 0);
        if (o.user_id && !countedBuyers.has(o.user_id)) {
          countedBuyers.add(o.user_id);
          r.customers += 1;
        }
      }

      setRows(Array.from(map.values()).sort((a, b) => b.revenue - a.revenue || b.orders - a.orders));
      setLoading(false);
    };
    load();
  }, [startTime, endTime]);

  const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
  const pieData = rows.filter((r) => r.orders > 0).slice(0, 8).map((r) => ({ name: r.source, value: r.orders }));

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Carregando fontes...</CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma venda registrada no período.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Distribuição por fonte</CardTitle>
          <CardDescription>De onde vieram os clientes que compraram</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalhes por fonte</CardTitle>
          <CardDescription>Clientes compradores, pedidos e receita atribuída</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((r, i) => {
            const share = totalOrders > 0 ? (r.orders / totalOrders) * 100 : 0;
            return (
              <div key={r.source} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="font-medium truncate">{r.source}</span>
                  </div>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {r.orders} pedidos · {share.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(share, 100)}%` }} />
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {r.customers} clientes · {formatBRL(r.revenue)}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
