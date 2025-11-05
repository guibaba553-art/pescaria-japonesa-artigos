import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, Package, DollarSign, Users, ShoppingCart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  revenueGrowth: number;
  ordersGrowth: number;
}

interface SalesData {
  date: string;
  revenue: number;
  orders: number;
}

interface ProductSales {
  name: string;
  quantity: number;
  revenue: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAuth();
  const { toast } = useToast();
  
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalOrders: 0,
    totalProducts: 0,
    totalCustomers: 0,
    revenueGrowth: 0,
    ordersGrowth: 0
  });
  
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [topProducts, setTopProducts] = useState<ProductSales[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/auth');
    }
  }, [isAdmin, loading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      loadDashboardData();
    }
  }, [isAdmin]);

  const loadDashboardData = async () => {
    try {
      setLoadingData(true);

      // Estatísticas gerais
      const { data: orders } = await supabase
        .from('orders')
        .select('total_amount, shipping_cost, created_at, status');

      const { data: products } = await supabase
        .from('products')
        .select('id');

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id');

      // Calcular receita total (apenas pedidos entregues)
      const deliveredOrders = orders?.filter(o => o.status === 'entregado') || [];
      const totalRevenue = deliveredOrders.reduce((sum, o) => 
        sum + (parseFloat(String(o.total_amount)) + parseFloat(String(o.shipping_cost))), 0
      );

      // Calcular crescimento (últimos 30 dias vs 30 dias anteriores)
      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const last60Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      const recentOrders = deliveredOrders.filter(o => 
        new Date(o.created_at) >= last30Days
      );
      const previousOrders = deliveredOrders.filter(o => 
        new Date(o.created_at) >= last60Days && new Date(o.created_at) < last30Days
      );

      const recentRevenue = recentOrders.reduce((sum, o) => 
        sum + (parseFloat(String(o.total_amount)) + parseFloat(String(o.shipping_cost))), 0
      );
      const previousRevenue = previousOrders.reduce((sum, o) => 
        sum + (parseFloat(String(o.total_amount)) + parseFloat(String(o.shipping_cost))), 0
      );

      const revenueGrowth = previousRevenue > 0 
        ? ((recentRevenue - previousRevenue) / previousRevenue) * 100 
        : 0;

      const ordersGrowth = previousOrders.length > 0
        ? ((recentOrders.length - previousOrders.length) / previousOrders.length) * 100
        : 0;

      setStats({
        totalRevenue,
        totalOrders: deliveredOrders.length,
        totalProducts: products?.length || 0,
        totalCustomers: profiles?.length || 0,
        revenueGrowth,
        ordersGrowth
      });

      // Dados de vendas por dia (últimos 30 dias)
      const salesByDay: Record<string, { revenue: number; orders: number }> = {};
      
      recentOrders.forEach(order => {
        const date = new Date(order.created_at).toLocaleDateString('pt-BR');
        if (!salesByDay[date]) {
          salesByDay[date] = { revenue: 0, orders: 0 };
        }
        salesByDay[date].revenue += parseFloat(String(order.total_amount)) + parseFloat(String(order.shipping_cost));
        salesByDay[date].orders += 1;
      });

      const salesDataArray: SalesData[] = Object.entries(salesByDay)
        .map(([date, data]) => ({
          date,
          revenue: data.revenue,
          orders: data.orders
        }))
        .sort((a, b) => {
          const [dA, mA, yA] = a.date.split('/');
          const [dB, mB, yB] = b.date.split('/');
          return new Date(`${yA}-${mA}-${dA}`).getTime() - new Date(`${yB}-${mB}-${dB}`).getTime();
        });

      setSalesData(salesDataArray);

      // Produtos mais vendidos
      const { data: orderItems } = await supabase
        .from('order_items')
        .select(`
          quantity,
          price_at_purchase,
          products (name)
        `);

      const productSales: Record<string, { quantity: number; revenue: number }> = {};
      
      orderItems?.forEach((item: any) => {
        const name = item.products.name;
        if (!productSales[name]) {
          productSales[name] = { quantity: 0, revenue: 0 };
        }
        productSales[name].quantity += item.quantity;
        productSales[name].revenue += item.quantity * parseFloat(item.price_at_purchase);
      });

      const topProductsArray = Object.entries(productSales)
        .map(([name, data]) => ({
          name,
          quantity: data.quantity,
          revenue: data.revenue
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      setTopProducts(topProductsArray);

    } catch (error: any) {
      console.error('Erro ao carregar dashboard:', error);
      toast({
        title: 'Erro ao carregar dados',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoadingData(false);
    }
  };

  if (loading || loadingData) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!isAdmin) {
    return null;
  }

  const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#ca8a04'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Header />
      
      <div className="container mx-auto p-6 pt-24 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <Button variant="outline" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao Admin
          </Button>
        </div>

        {/* Cards de Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R$ {stats.totalRevenue.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                <span className={stats.revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {stats.revenueGrowth >= 0 ? '+' : ''}{stats.revenueGrowth.toFixed(1)}%
                </span> vs. mês anterior
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pedidos</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalOrders}</div>
              <p className="text-xs text-muted-foreground">
                <span className={stats.ordersGrowth >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {stats.ordersGrowth >= 0 ? '+' : ''}{stats.ordersGrowth.toFixed(1)}%
                </span> vs. mês anterior
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Produtos</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalProducts}</div>
              <p className="text-xs text-muted-foreground">
                Total de produtos cadastrados
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Clientes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalCustomers}</div>
              <p className="text-xs text-muted-foreground">
                Total de clientes cadastrados
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <Tabs defaultValue="revenue" className="space-y-4">
          <TabsList>
            <TabsTrigger value="revenue">Receita</TabsTrigger>
            <TabsTrigger value="orders">Pedidos</TabsTrigger>
            <TabsTrigger value="products">Produtos</TabsTrigger>
          </TabsList>

          <TabsContent value="revenue" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Receita Diária (Últimos 30 Dias)</CardTitle>
                <CardDescription>Evolução da receita ao longo do tempo</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={salesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="#2563eb" 
                      name="Receita"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pedidos Diários (Últimos 30 Dias)</CardTitle>
                <CardDescription>Número de pedidos por dia</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="orders" fill="#7c3aed" name="Pedidos" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Produtos Mais Vendidos</CardTitle>
                <CardDescription>Produtos com maior receita</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={topProducts}
                        dataKey="revenue"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={(entry) => `${entry.name.substring(0, 15)}...`}
                      >
                        {topProducts.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `R$ ${value.toFixed(2)}`} />
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="space-y-2">
                    {topProducts.map((product, index) => (
                      <div key={index} className="flex justify-between items-center p-2 border rounded">
                        <span className="text-sm font-medium truncate flex-1">
                          {index + 1}. {product.name}
                        </span>
                        <div className="text-right">
                          <div className="text-sm font-bold">
                            R$ {product.revenue.toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {product.quantity} unidades
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
