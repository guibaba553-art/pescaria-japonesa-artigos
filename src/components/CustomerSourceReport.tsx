import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { startOfDay, endOfDay } from 'date-fns';

const COLORS = ['hsl(var(--primary))', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#0ea5e9', '#a855f7'];

interface SourceRow {
  source: string;
  sessions: number;
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

      // Visitas paginadas (limite padrão de 1.000 linhas do PostgREST)
      const PAGE_SIZE = 1000;
      let visits: any[] = [];
      let page = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('site_visits')
          .select('referrer, session_id, user_id, created_at')
          .gte('created_at', sinceIso)
          .lte('created_at', untilIso)
          .order('created_at', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) break;
        const list = data || [];
        visits = visits.concat(list);
        hasMore = list.length === PAGE_SIZE;
        page++;
      }

      // Primeira fonte de cada sessão
      const sessionSource = new Map<string, string>();
      for (const v of visits) {
        const sid = v.session_id || `anon-${v.created_at}`;
        if (!sessionSource.has(sid)) sessionSource.set(sid, classifySource(v.referrer));
      }

      // Todas as fontes vistas por cada usuário identificado + última fonte (last touch)
      const userSources = new Map<string, Set<string>>();
      const userLastSource = new Map<string, string>();
      for (const v of visits) {
        if (!v.user_id) continue;
        const sid = v.session_id || '';
        const src = sessionSource.get(sid) ?? classifySource(v.referrer);
        if (!userSources.has(v.user_id)) userSources.set(v.user_id, new Set());
        userSources.get(v.user_id)!.add(src);
        userLastSource.set(v.user_id, src); // visitas vêm ordenadas por data asc
      }

      // Pedidos do site no período
      const { data: orders } = await supabase
        .from('orders')
        .select('user_id, total_amount, status, source')
        .eq('source', 'site')
        .gte('created_at', sinceIso)
        .lte('created_at', untilIso)
        .not('status', 'in', '(cancelado,aguardando_pagamento)');

      // Para compradores sem visita no período, buscar a fonte histórica
      const missingBuyers = Array.from(
        new Set((orders || []).map((o: any) => o.user_id).filter((id: string | null) => id && !userLastSource.has(id))),
      ) as string[];
      if (missingBuyers.length > 0) {
        const { data: histVisits } = await supabase
          .from('site_visits')
          .select('referrer, user_id, created_at')
          .in('user_id', missingBuyers)
          .order('created_at', { ascending: true })
          .limit(5000);
        for (const v of histVisits || []) {
          if (!v.user_id) continue;
          userLastSource.set(v.user_id, classifySource(v.referrer));
        }
      }

      const map = new Map<string, SourceRow>();
      const get = (source: string) => {
        let r = map.get(source);
        if (!r) {
          r = { source, sessions: 0, customers: 0, orders: 0, revenue: 0 };
          map.set(source, r);
        }
        return r;
      };

      for (const source of sessionSource.values()) get(source).sessions += 1;
      for (const sources of userSources.values()) {
        for (const source of sources) get(source).customers += 1;
      }
      for (const o of orders || []) {
        const source = (o.user_id && userLastSource.get(o.user_id)) || 'Não identificado';
        const r = get(source);
        r.orders += 1;
        r.revenue += Number(o.total_amount || 0);
      }


      setRows(Array.from(map.values()).sort((a, b) => b.sessions - a.sessions || b.customers - a.customers));
      setLoading(false);
    };
    load();
  }, [startTime, endTime]);

  const totalSessions = rows.reduce((s, r) => s + r.sessions, 0);
  const pieData = rows.filter((r) => r.sessions > 0).slice(0, 8).map((r) => ({ name: r.source, value: r.sessions }));

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
          Nenhuma visita registrada no período.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Distribuição por fonte</CardTitle>
          <CardDescription>De onde vêm as sessões do site</CardDescription>
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
          <CardDescription>Sessões, clientes identificados e vendas atribuídas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((r, i) => {
            const share = totalSessions > 0 ? (r.sessions / totalSessions) * 100 : 0;
            return (
              <div key={r.source} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="font-medium truncate">{r.source}</span>
                  </div>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {r.sessions} sessões · {share.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(share, 100)}%` }} />
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {r.customers} clientes · {r.orders} pedidos · {formatBRL(r.revenue)}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
