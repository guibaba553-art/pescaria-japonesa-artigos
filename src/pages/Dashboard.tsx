import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Package, DollarSign, Users, ShoppingCart, Store, Globe,
  TrendingUp, Download, AlertTriangle, Clock, Receipt, Target,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SiteAnalytics } from '@/components/SiteAnalytics';

interface ChannelStats {
  totalRevenue: number;
  totalOrders: number;
  revenueGrowth: number;
  ordersGrowth: number;
  avgTicket: number;
}

interface SalesData {
  date: string;
  pdv: number;
  site: number;
  pdvOrders: number;
  siteOrders: number;
}

interface ProductSales {
  name: string;
  quantity: number;
  revenue: number;
}

interface LowStockProduct {
  id: string;
  name: string;
  stock: number;
}

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PERIODS = {
  '7': { label: 'Últimos 7 dias', days: 7 },
  '30': { label: 'Últimos 30 dias', days: 30 },
  '90': { label: 'Últimos 90 dias', days: 90 },
  '365': { label: 'Último ano', days: 365 },
} as const;

type PeriodKey = keyof typeof PERIODS;

export default function Dashboard() {
  const navigate = useNavigate();
  const { isAdmin, permissions, loading } = useAuth();
  const { toast } = useToast();

  const canView = isAdmin || permissions.dashboard;

  const [period, setPeriod] = useState<PeriodKey>('30');

  const [pdvStats, setPdvStats] = useState<ChannelStats>({
    totalRevenue: 0, totalOrders: 0, revenueGrowth: 0, ordersGrowth: 0, avgTicket: 0,
  });
  const [siteStats, setSiteStats] = useState<ChannelStats>({
    totalRevenue: 0, totalOrders: 0, revenueGrowth: 0, ordersGrowth: 0, avgTicket: 0,
  });
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);
  const [outOfStock, setOutOfStock] = useState(0);
  const [statusBreakdown, setStatusBreakdown] = useState<{ name: string; value: number }[]>([]);

  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [topPdv, setTopPdv] = useState<ProductSales[]>([]);
  const [topSite, setTopSite] = useState<ProductSales[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !canView) navigate('/admin');
  }, [canView, loading, navigate]);

  useEffect(() => {
    if (canView) loadDashboardData();
  }, [canView, period]);

  const calcChannelStats = (orders: any[], days: number): ChannelStats => {
    const now = new Date();
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevStart = new Date(now.getTime() - 2 * days * 24 * 60 * 60 * 1000);

    const sumOf = (list: any[]) =>
      list.reduce(
        (s, o) => s + parseFloat(String(o.total_amount)) + parseFloat(String(o.shipping_cost)),
        0
      );

    const recent = orders.filter((o) => new Date(o.created_at) >= start);
    const previous = orders.filter(
      (o) => new Date(o.created_at) >= prevStart && new Date(o.created_at) < start
    );

    const recentRev = sumOf(recent);
    const prevRev = sumOf(previous);
    const totalRev = sumOf(orders);

    return {
      totalRevenue: totalRev,
      totalOrders: orders.length,
      revenueGrowth: prevRev > 0 ? ((recentRev - prevRev) / prevRev) * 100 : 0,
      ordersGrowth:
        previous.length > 0 ? ((recent.length - previous.length) / previous.length) * 100 : 0,
      avgTicket: orders.length > 0 ? totalRev / orders.length : 0,
    };
  };

  const loadDashboardData = async () => {
    try {
      setLoadingData(true);

      const [
        { data: orders },
        { data: products },
        { data: profiles },
        { data: orderItems },
      ] = await Promise.all([
        supabase.from('orders').select('id, total_amount, shipping_cost, created_at, status, source'),
        supabase.from('products').select('id, name, stock'),
        supabase.from('profiles').select('id'),
        supabase
          .from('order_items')
          .select('quantity, price_at_purchase, order_id, products(name), orders(source, status)'),
      ]);

      const days = PERIODS[period].days;
      const delivered = (orders || []).filter((o) => o.status === 'entregado');
      const pdvOrders = delivered.filter((o) => o.source === 'pdv');
      const siteOrders = delivered.filter((o) => o.source !== 'pdv');

      setPdvStats(calcChannelStats(pdvOrders, days));
      setSiteStats(calcChannelStats(siteOrders, days));
      setTotalProducts(products?.length || 0);
      setTotalCustomers(profiles?.length || 0);

      // Pending / status overview
      const pending = (orders || []).filter(
        (o) => o.status === 'em_preparo' || o.status === 'aguardando_pagamento'
      ).length;
      setPendingOrders(pending);

      const statusMap: Record<string, number> = {};
      (orders || []).forEach((o) => {
        statusMap[o.status] = (statusMap[o.status] || 0) + 1;
      });
      setStatusBreakdown(
        Object.entries(statusMap).map(([name, value]) => ({
          name: name.replace(/_/g, ' '),
          value,
        }))
      );

      // Stock alerts
      const low = (products || [])
        .filter((p: any) => p.stock > 0 && p.stock <= 5)
        .map((p: any) => ({ id: p.id, name: p.name, stock: p.stock }))
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 10);
      setLowStock(low);
      setOutOfStock((products || []).filter((p: any) => p.stock === 0).length);

      // Vendas diárias dentro do período por canal
      const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const byDay: Record<string, SalesData> = {};

      delivered
        .filter((o) => new Date(o.created_at) >= start)
        .forEach((o) => {
          const date = new Date(o.created_at).toLocaleDateString('pt-BR');
          if (!byDay[date]) {
            byDay[date] = { date, pdv: 0, site: 0, pdvOrders: 0, siteOrders: 0 };
          }
          const value =
            parseFloat(String(o.total_amount)) + parseFloat(String(o.shipping_cost));
          if (o.source === 'pdv') {
            byDay[date].pdv += value;
            byDay[date].pdvOrders += 1;
          } else {
            byDay[date].site += value;
            byDay[date].siteOrders += 1;
          }
        });

      const sorted = Object.values(byDay).sort((a, b) => {
        const [dA, mA, yA] = a.date.split('/');
        const [dB, mB, yB] = b.date.split('/');
        return new Date(`${yA}-${mA}-${dA}`).getTime() - new Date(`${yB}-${mB}-${dB}`).getTime();
      });
      setSalesData(sorted);

      // Top produtos por canal (apenas pedidos entregues)
      const aggregate = (filterFn: (item: any) => boolean) => {
        const acc: Record<string, ProductSales> = {};
        (orderItems || [])
          .filter(filterFn)
          .forEach((item: any) => {
            const name = item.products?.name || '—';
            if (!acc[name]) acc[name] = { name, quantity: 0, revenue: 0 };
            acc[name].quantity += item.quantity;
            acc[name].revenue += item.quantity * parseFloat(item.price_at_purchase);
          });
        return Object.values(acc)
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10);
      };

      setTopPdv(
        aggregate((i: any) => i.orders?.status === 'entregado' && i.orders?.source === 'pdv')
      );
      setTopSite(
        aggregate((i: any) => i.orders?.status === 'entregado' && i.orders?.source !== 'pdv')
      );
    } catch (error: any) {
      console.error('Erro ao carregar dashboard:', error);
      toast({ title: 'Erro ao carregar dados', description: error.message, variant: 'destructive' });
    } finally {
      setLoadingData(false);
    }
  };

  const exportCSV = () => {
    const rows = [
      ['Data', 'Receita PDV', 'Receita Site', 'Pedidos PDV', 'Pedidos Site'],
      ...salesData.map((d) => [
        d.date, d.pdv.toFixed(2), d.site.toFixed(2), d.pdvOrders, d.siteOrders,
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-${period}d-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'CSV exportado!' });
  };

  if (loading || loadingData) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }
  if (!isAdmin) return null;

  const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#ca8a04'];

  const StatCard = ({
    title, value, growth, icon, hint,
  }: {
    title: string; value: string; growth?: number; icon: React.ReactNode; hint?: string;
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {growth !== undefined && (
          <p className="text-xs text-muted-foreground">
            <span className={growth >= 0 ? 'text-green-600' : 'text-red-600'}>
              {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
            </span>{' '}
            vs. período anterior
          </p>
        )}
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );

  const ChannelSection = ({
    title, icon, stats, color, dataKey, orderKey, top,
  }: {
    title: string; icon: React.ReactNode; stats: ChannelStats; color: string;
    dataKey: 'pdv' | 'site'; orderKey: 'pdvOrders' | 'siteOrders'; top: ProductSales[];
  }) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-2xl font-bold">{title}</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Receita"
          value={formatBRL(stats.totalRevenue)}
          growth={stats.revenueGrowth}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Pedidos"
          value={String(stats.totalOrders)}
          growth={stats.ordersGrowth}
          icon={<ShoppingCart className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Ticket Médio"
          value={formatBRL(stats.avgTicket)}
          icon={<Target className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="revenue">Receita</TabsTrigger>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
          <TabsTrigger value="products">Produtos</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue">
          <Card>
            <CardHeader>
              <CardTitle>Receita Diária — {title} ({PERIODS[period].label})</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Legend />
                  <Line type="monotone" dataKey={dataKey} stroke={color} name="Receita" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Pedidos Diários — {title} ({PERIODS[period].label})</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey={orderKey} fill={color} name="Pedidos" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Produtos — {title}</CardTitle>
              <CardDescription>Produtos com maior receita neste canal</CardDescription>
            </CardHeader>
            <CardContent>
              {top.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma venda registrada neste canal ainda.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={top}
                        dataKey="revenue"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={(e: any) =>
                          `${String(e.name).substring(0, 15)}${e.name.length > 15 ? '…' : ''}`
                        }
                      >
                        {top.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatBRL(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {top.map((p, i) => (
                      <div key={i} className="flex justify-between items-center p-2 border rounded">
                        <span className="text-sm font-medium truncate flex-1">
                          {i + 1}. {p.name}
                        </span>
                        <div className="text-right">
                          <div className="text-sm font-bold">{formatBRL(p.revenue)}</div>
                          <div className="text-xs text-muted-foreground">{p.quantity} unidades</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );

  const totalRevenue = pdvStats.totalRevenue + siteStats.totalRevenue;
  const totalOrders = pdvStats.totalOrders + siteStats.totalOrders;
  const overallAvgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />

      {/* Commercial dark banner */}
      <div className="bg-foreground text-background pt-20 lg:pt-32 pb-8">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary mb-3">
                <TrendingUp className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Dashboard</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-black tracking-tight">
                Visão Geral
              </h1>
              <p className="text-sm text-background/60 mt-1">
                Receita, pedidos, clientes e produtos em tempo real.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
                <SelectTrigger className="w-[180px] rounded-full bg-transparent border-background/20 text-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PERIODS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={exportCSV}
                className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground"
              >
                <Download className="w-4 h-4 mr-2" />
                CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/admin')}
                className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar ao Admin
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-6 -mt-4 space-y-8">

        {/* Visão geral - linha 1: receita */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Receita Total"
            value={formatBRL(totalRevenue)}
            icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          />
          <StatCard
            title="Pedidos"
            value={String(totalOrders)}
            icon={<ShoppingCart className="h-4 w-4 text-muted-foreground" />}
          />
          <StatCard
            title="Ticket Médio"
            value={formatBRL(overallAvgTicket)}
            icon={<Target className="h-4 w-4 text-muted-foreground" />}
          />
          <StatCard
            title="Pedidos Pendentes"
            value={String(pendingOrders)}
            hint="Aguardando pagamento ou em preparo"
            icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          />
        </div>

        {/* Visão geral - linha 2: estoque & clientes */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Produtos"
            value={String(totalProducts)}
            icon={<Package className="h-4 w-4 text-muted-foreground" />}
          />
          <StatCard
            title="Clientes"
            value={String(totalCustomers)}
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
          />
          <StatCard
            title="Estoque Baixo"
            value={String(lowStock.length)}
            hint="Produtos com 5 unidades ou menos"
            icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
          />
          <StatCard
            title="Sem Estoque"
            value={String(outOfStock)}
            hint="Indisponíveis no catálogo"
            icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
          />
        </div>

        {/* Alertas de estoque */}
        {lowStock.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                Atenção: Produtos com estoque baixo
              </CardTitle>
              <CardDescription>Repor o quanto antes para evitar rupturas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {lowStock.map((p) => (
                  <div
                    key={p.id}
                    className="flex justify-between items-center p-3 border rounded hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate('/admin/catalogo')}
                  >
                    <span className="text-sm font-medium truncate flex-1">{p.name}</span>
                    <Badge variant={p.stock <= 2 ? 'destructive' : 'secondary'}>
                      {p.stock} un.
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Distribuição de status */}
        {statusBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Distribuição de Pedidos por Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={statusBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Canais separados */}
        <Tabs defaultValue="pdv" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pdv" className="gap-2">
              <Store className="h-4 w-4" /> PDV
            </TabsTrigger>
            <TabsTrigger value="site" className="gap-2">
              <Globe className="h-4 w-4" /> Site
            </TabsTrigger>
            <TabsTrigger value="traffic">Tráfego do Site</TabsTrigger>
          </TabsList>

          <TabsContent value="pdv">
            <ChannelSection
              title="PDV"
              icon={<Store className="h-6 w-6 text-primary" />}
              stats={pdvStats}
              color="#2563eb"
              dataKey="pdv"
              orderKey="pdvOrders"
              top={topPdv}
            />
          </TabsContent>

          <TabsContent value="site">
            <ChannelSection
              title="Site"
              icon={<Globe className="h-6 w-6 text-primary" />}
              stats={siteStats}
              color="#7c3aed"
              dataKey="site"
              orderKey="siteOrders"
              top={topSite}
            />
          </TabsContent>

          <TabsContent value="traffic">
            <SiteAnalytics />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
