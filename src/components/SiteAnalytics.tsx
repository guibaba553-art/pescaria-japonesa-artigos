import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Eye, Users, MousePointerClick, TrendingUp } from 'lucide-react';

const COLORS = ['hsl(var(--primary))', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

interface DailyVisit { date: string; visits: number; visitors: number }
interface PageStat { path: string; label: string; visits: number }
interface SourceStat { source: string; visits: number }

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const STATIC_LABELS: Record<string, string> = {
  '/': 'Início',
  '/produtos': 'Produtos',
  '/conta': 'Minha conta',
  '/auth': 'Login',
  '/forgot-password': 'Esqueci a senha',
  '/reset-password': 'Redefinir senha',
  '/politica-privacidade': 'Política de privacidade',
  '/termos-de-uso': 'Termos de uso',
  '/politica-de-trocas': 'Política de trocas',
  '/politica-de-frete': 'Política de frete',
  '/completar-cadastro': 'Completar cadastro',
  '/meus-dados': 'Meus dados',
  '/unsubscribe': 'Cancelar inscrição',
};

function basePath(path: string): string {
  const clean = path.split('?')[0].split('#')[0];
  if (clean.startsWith('/produto/')) return '/produto/:id';
  if (clean.startsWith('/retirada/')) return '/retirada/:id';
  return clean;
}

function extractId(path: string): string | null {
  const m = path.match(UUID_RE);
  return m ? m[0] : null;
}

function friendlyLabel(path: string, productNames: Map<string, string>): string {
  const base = basePath(path);
  if (base === '/produto/:id') {
    const id = extractId(path);
    const name = id ? productNames.get(id) : null;
    return name ? `Produto: ${name}` : 'Produto';
  }
  if (base === '/retirada/:id') return 'Retirada de pedido';
  return STATIC_LABELS[base] ?? base;
}

function classifyReferrer(ref: string | null): string {
  if (!ref) return 'Direto';
  try {
    const host = new URL(ref).hostname.toLowerCase();
    if (host.includes('google')) return 'Google';
    if (host.includes('bing')) return 'Bing';
    if (host.includes('facebook') || host.includes('fb.')) return 'Facebook';
    if (host.includes('instagram')) return 'Instagram';
    if (host.includes('whatsapp') || host.includes('wa.me')) return 'WhatsApp';
    if (host.includes(window.location.hostname)) return 'Direto';
    return host.replace('www.', '');
  } catch {
    return 'Outros';
  }
}

export function SiteAnalytics() {
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ visits: 0, visitors: 0, conversion: 0, orders30d: 0 });
  const [dailyData, setDailyData] = useState<DailyVisit[]>([]);
  const [topPages, setTopPages] = useState<PageStat[]>([]);
  const [sources, setSources] = useState<SourceStat[]>([]);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString();

    // Buscar IDs de admins e funcionários para excluir das estatísticas
    const { data: staffRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin', 'employee']);
    const staffIds = Array.from(new Set((staffRoles || []).map((r: any) => r.user_id))).filter(Boolean);

    let visitsQuery = supabase
      .from('site_visits')
      .select('path, referrer, session_id, created_at, user_id')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .limit(10000);

    if (staffIds.length > 0) {
      // Excluir visitas feitas por usuários staff (mantém anônimos com user_id null)
      visitsQuery = visitsQuery.or(
        `user_id.is.null,user_id.not.in.(${staffIds.join(',')})`
      );
    }

    const [{ data: visits }, { count: ordersCount }] = await Promise.all([
      visitsQuery,
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sinceIso),
    ]);

    const rows = visits || [];

    // Daily aggregation
    const byDay = new Map<string, { visits: number; sessions: Set<string> }>();
    for (const v of rows) {
      const d = new Date(v.created_at).toISOString().slice(0, 10);
      if (!byDay.has(d)) byDay.set(d, { visits: 0, sessions: new Set() });
      const entry = byDay.get(d)!;
      entry.visits++;
      if (v.session_id) entry.sessions.add(v.session_id);
    }
    // fill last 30 days
    const daily: DailyVisit[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const entry = byDay.get(key);
      daily.push({
        date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        visits: entry?.visits ?? 0,
        visitors: entry?.sessions.size ?? 0,
      });
    }

    // Top pages
    const pageMap = new Map<string, number>();
    for (const v of rows) pageMap.set(v.path, (pageMap.get(v.path) ?? 0) + 1);
    const top = Array.from(pageMap.entries())
      .map(([path, visits]) => ({ path, visits }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10);

    // Traffic sources
    const sourceMap = new Map<string, number>();
    const uniqueSessions = new Set<string>();
    for (const v of rows) {
      if (v.session_id) uniqueSessions.add(v.session_id);
      const src = classifyReferrer(v.referrer);
      sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1);
    }
    const sourceList = Array.from(sourceMap.entries())
      .map(([source, visits]) => ({ source, visits }))
      .sort((a, b) => b.visits - a.visits);

    const totalVisitors = uniqueSessions.size;
    const orders = ordersCount ?? 0;
    const conversion = totalVisitors > 0 ? (orders / totalVisitors) * 100 : 0;

    setTotals({
      visits: rows.length,
      visitors: totalVisitors,
      conversion,
      orders30d: orders,
    });
    setDailyData(daily);
    setTopPages(top);
    setSources(sourceList);
    setLoading(false);
  };

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Carregando dados de tráfego...</div>;
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Visitas (30d)</CardTitle>
            <Eye className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.visits.toLocaleString('pt-BR')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Visitantes únicos</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.visitors.toLocaleString('pt-BR')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Pedidos (30d)</CardTitle>
            <MousePointerClick className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.orders30d}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Taxa de conversão</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.conversion.toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground">visita → pedido</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily visits chart */}
      <Card>
        <CardHeader>
          <CardTitle>Visitas por dia (últimos 30 dias)</CardTitle>
          <CardDescription>Total de visitas e visitantes únicos por dia</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="visits" stroke="hsl(var(--primary))" name="Visitas" strokeWidth={2} />
              <Line type="monotone" dataKey="visitors" stroke="#10b981" name="Visitantes únicos" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top pages */}
        <Card>
          <CardHeader>
            <CardTitle>Páginas mais visitadas</CardTitle>
            <CardDescription>Top 10 páginas por número de visitas</CardDescription>
          </CardHeader>
          <CardContent>
            {topPages.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Sem dados ainda.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topPages} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="path" type="category" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="visits" fill="hsl(var(--primary))" name="Visitas" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Traffic sources */}
        <Card>
          <CardHeader>
            <CardTitle>Origem do tráfego</CardTitle>
            <CardDescription>De onde vêm seus visitantes</CardDescription>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Sem dados ainda.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={sources}
                    dataKey="visits"
                    nameKey="source"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(e) => `${e.source}: ${e.visits}`}
                  >
                    {sources.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
