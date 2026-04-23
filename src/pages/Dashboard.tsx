import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Package, DollarSign, Users, ShoppingCart, Store, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SiteAnalytics } from '@/components/SiteAnalytics';

interface ChannelStats {
  totalRevenue: number;
  totalOrders: number;
  revenueGrowth: number;
  ordersGrowth: number;
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

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Dashboard() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAuth();
  const { toast } = useToast();

  const [pdvStats, setPdvStats] = useState<ChannelStats>({
    totalRevenue: 0, totalOrders: 0, revenueGrowth: 0, ordersGrowth: 0,
  });
  const [siteStats, setSiteStats] = useState<ChannelStats>({
    totalRevenue: 0, totalOrders: 0, revenueGrowth: 0, ordersGrowth: 0,
  });
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);

  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [topPdv, setTopPdv] = useState<ProductSales[]>([]);
  const [topSite, setTopSite] = useState<ProductSales[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !isAdmin) navigate('/auth');
  }, [isAdmin, loading, navigate]);

  useEffect(() => {
    if (isAdmin) loadDashboardData();
  }, [isAdmin]);

  const calcChannelStats = (orders: any[]): ChannelStats => {
    const now = new Date();
    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const sumOf = (list: any[]) =>
      list.reduce(
        (s, o) => s + parseFloat(String(o.total_amount)) + parseFloat(String(o.shipping_cost)),
        0
      );

    const recent = orders.filter((o) => new Date(o.created_at) >= last30);
    const previous = orders.filter(
      (o) => new Date(o.created_at) >= last60 && new Date(o.created_at) < last30
    );

    const recentRev = sumOf(recent);
    const prevRev = sumOf(previous);

    return {
      totalRevenue: sumOf(orders),
      totalOrders: orders.length,
      revenueGrowth: prevRev > 0 ? ((recentRev - prevRev) / prevRev) * 100 : 0,
      ordersGrowth:
        previous.length > 0 ? ((recent.length - previous.length) / previous.length) * 100 : 0,
    };
  };

  const loadDashboardData = async () => {
    try {
      setLoadingData(true);

      const [{ data: orders }, { data: products }, { data: profiles }, { data: orderItems }] =
        await Promise.all([
          supabase.from('orders').select('id, total_amount, shipping_cost, created_at, status, source'),
          supabase.from('products').select('id'),
          supabase.from('profiles').select('id'),
          supabase
            .from('order_items')
            .select('quantity, price_at_purchase, order_id, products(name), orders(source, status)'),
        ]);

      const delivered = (orders || []).filter((o) => o.status === 'entregado');
      const pdvOrders = delivered.filter((o) => o.source === 'pdv');
      const siteOrders = delivered.filter((o) => o.source !== 'pdv');

      setPdvStats(calcChannelStats(pdvOrders));
      setSiteStats(calcChannelStats(siteOrders));
      setTotalProducts(products?.length || 0);
      setTotalCustomers(profiles?.length || 0);

      // Vendas diárias últimos 30 dias separadas por canal
      const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const byDay: Record<string, SalesData> = {};

      delivered
        .filter((o) => new Date(o.created_at) >= last30)
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

  if (loading || loadingData) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }
  if (!isAdmin) return null;

  const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#ca8a04'];

  const StatCard = ({
    title,
    value,
    growth,
    icon,
  }: {
    title: string;
    value: string;
    growth?: number;
    icon: React.ReactNode;
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
              {growth >= 0 ? '+' : ''}
              {growth.toFixed(1)}%
            </span>{' '}
            vs. mês anterior
          </p>
        )}
      </CardContent>
    </Card>
  );

  const ChannelSection = ({
    title,
    icon,
    stats,
    color,
    dataKey,
    orderKey,
    top,
  }: {
    title: string;
    icon: React.ReactNode;
    stats: ChannelStats;
    color: string;
    dataKey: 'pdv' | 'site';
    orderKey: 'pdvOrders' | 'siteOrders';
    top: ProductSales[];
  }) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-2xl font-bold">{title}</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <CardTitle>Receita Diária — {title} (Últimos 30 dias)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey={dataKey}
                    stroke={color}
                    name="Receita"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Pedidos Diários — {title} (Últimos 30 dias)</CardTitle>
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
                      <div
                        key={i}
                        className="flex justify-between items-center p-2 border rounded"
                      >
                        <span className="text-sm font-medium truncate flex-1">
                          {i + 1}. {p.name}
                        </span>
                        <div className="text-right">
                          <div className="text-sm font-bold">{formatBRL(p.revenue)}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.quantity} unidades
                          </div>
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Header />

      <div className="container mx-auto p-6 pt-24 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <Button variant="outline" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao Admin
          </Button>
        </div>

        {/* Visão geral */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Receita Total (Geral)"
            value={formatBRL(totalRevenue)}
            icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          />
          <StatCard
            title="Pedidos (Geral)"
            value={String(totalOrders)}
            icon={<ShoppingCart className="h-4 w-4 text-muted-foreground" />}
          />
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
        </div>

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
