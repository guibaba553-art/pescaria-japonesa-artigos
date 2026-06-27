import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  ArrowLeft, Package, DollarSign, Users, ShoppingCart, Store, Globe,
  TrendingUp, Download, AlertTriangle, Clock, Receipt, Target, Wallet, LayoutDashboard,
  Calendar as CalendarIcon, Boxes, Search,
} from 'lucide-react';

import { useToast } from '@/hooks/use-toast';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SiteAnalytics } from '@/components/SiteAnalytics';
import { format, startOfDay, endOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';

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
  stock: number;
}

interface CustomerSales {
  id: string;
  name: string;
  doc: string;
  score: number;
  orders: number;
  revenue: number;
  lastOrder: string | null;
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
  'custom': { label: 'Personalizado', days: 30 },
} as const;

type PeriodKey = keyof typeof PERIODS;

function getPresetRange(key: Exclude<PeriodKey, 'custom'>): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - PERIODS[key].days);
  return { from: startOfDay(from), to: endOfDay(to) };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isAdmin, permissions, loading } = useAuth();
  const { toast } = useToast();

  const canView = isAdmin || permissions.dashboard;

  const [period, setPeriod] = useState<PeriodKey>('30');
  const [range, setRange] = useState<DateRange>(() => getPresetRange('30'));
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const initialLoadedRef = useRef(false);

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
  const [totalCost, setTotalCost] = useState(0);
  const [itemsRevenue, setItemsRevenue] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [fixedExpenses, setFixedExpenses] = useState(0);
  const [variableExpenses, setVariableExpenses] = useState(0);

  // Estoque
  const [stockCostValue, setStockCostValue] = useState(0);
  const [stockPriceValue, setStockPriceValue] = useState(0);
  const [stockItemCount, setStockItemCount] = useState(0);
  const [stockHistory, setStockHistory] = useState<{ date: string; costValue: number; priceValue: number; items: number }[]>([]);


  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [topPdv, setTopPdv] = useState<ProductSales[]>([]);
  const [topSite, setTopSite] = useState<ProductSales[]>([]);
  const [customersList, setCustomersList] = useState<CustomerSales[]>([]);

  useEffect(() => {
    if (!loading && !canView) navigate('/admin');
  }, [canView, loading, navigate]);

  useEffect(() => {
    if (period !== 'custom') {
      setRange(getPresetRange(period as Exclude<PeriodKey, 'custom'>));
    }
  }, [period]);

  useEffect(() => {
    if (!canView || !range?.from || !range?.to) return;
    const isFirst = !initialLoadedRef.current;
    if (isFirst) setInitialLoading(true);
    initialLoadedRef.current = true;
    loadDashboardData().finally(() => {
      if (isFirst) setInitialLoading(false);
    });
  }, [canView, range]);

  const calcChannelStats = (orders: any[], range: DateRange): ChannelStats => {
    const start = startOfDay(range.from!);
    const end = endOfDay(range.to!);
    const rangeMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime());
    const prevStart = new Date(start.getTime() - rangeMs);

    const sumOf = (list: any[]) =>
      list.reduce(
        (s, o) => s + parseFloat(String(o.total_amount)) + parseFloat(String(o.shipping_cost)),
        0
      );

    const recent = orders.filter((o) => {
      const d = new Date(o.created_at);
      return d >= start && d <= end;
    });
    const previous = orders.filter((o) => {
      const d = new Date(o.created_at);
      return d >= prevStart && d < start;
    });

    const recentRev = sumOf(recent);
    const prevRev = sumOf(previous);

    return {
      totalRevenue: recentRev,
      totalOrders: recent.length,
      revenueGrowth: prevRev > 0 ? ((recentRev - prevRev) / prevRev) * 100 : 0,
      ordersGrowth:
        previous.length > 0 ? ((recent.length - previous.length) / previous.length) * 100 : 0,
      avgTicket: recent.length > 0 ? recentRev / recent.length : 0,
    };
  };

  const loadDashboardData = async () => {
    try {
      const start = startOfDay(range.from!);
      const end = endOfDay(range.to!);

      const [
         { data: products },
         { data: productVariations },
         { data: profiles },
         { data: expenses },
       ] = await Promise.all([
          supabase.rpc('get_products_admin'),
          supabase.rpc('get_product_variations_admin'),
          supabase.from('profiles').select('id'),
          supabase.from('expenses').select('amount, expense_date, type'),
        ]);

      // Buscar clientes (paginado)
      const customers: any[] = [];
      {
        const pageSize = 1000;
        let from = 0;
        while (true) {
          const { data: page, error } = await supabase
            .from('customers')
            .select('id, full_name, cpf, cnpj, score')
            .order('full_name', { ascending: true })
            .range(from, from + pageSize - 1);
          if (error) { console.error('Erro ao carregar clientes:', error); break; }
          if (!page || page.length === 0) break;
          customers.push(...page);
          if (page.length < pageSize) break;
          from += pageSize;
        }
      }

      // Buscar TODOS os pedidos (paginado — Supabase limita a 1000 por requisição)
      const orders: any[] = [];
      {
        const pageSize = 1000;
        let from = 0;
        while (true) {
          const { data: page, error } = await supabase
            .from('orders')
            .select('id, total_amount, shipping_cost, created_at, status, source, customer_id')
            .order('created_at', { ascending: false })
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!page || page.length === 0) break;
          orders.push(...page);
          if (page.length < pageSize) break;
          from += pageSize;
        }
      }

      const delivered = (orders || []).filter((o) => o.status === 'entregado');
      const pdvOrders = delivered.filter((o) => o.source === 'pdv');
      const siteOrders = delivered.filter((o) => o.source !== 'pdv');

      setPdvStats(calcChannelStats(pdvOrders, range));
      setSiteStats(calcChannelStats(siteOrders, range));
      setTotalProducts(products?.length || 0);
      setTotalCustomers(profiles?.length || 0);

      const productMap = new Map((products || []).map((p: any) => [p.id, p]));
      const variationMap = new Map((productVariations || []).map((v: any) => [v.id, v]));
      const orderMap = new Map((orders || []).map((o: any) => [o.id, o]));

      // Buscar TODOS os order_items (paginado para evitar limite de 1000)
      const orderItems: any[] = [];
      {
        const pageSize = 1000;
        let from = 0;
        while (true) {
          const { data: page, error } = await supabase
            .from('order_items')
            .select('quantity, price_at_purchase, order_id, product_id, variation_id')
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!page || page.length === 0) break;
          orderItems.push(...page);
          if (page.length < pageSize) break;
          from += pageSize;
        }
      }

      // Receita de itens entregues dentro do período (preço realmente cobrado)
      const deliveredInRange = delivered.filter((o) => {
        const d = new Date(o.created_at);
        return d >= start && d <= end;
      });
      const deliveredIds = new Set(deliveredInRange.map((o) => o.id));
      let receitaItensAcc = 0;
      orderItems.forEach((it: any) => {
        if (!deliveredIds.has(it.order_id)) return;
        const qty = Number(it.quantity || 0);
        const venda = Number(it.price_at_purchase || 0);
        receitaItensAcc += venda * qty;
      });
      setTotalCost(0);
      setItemsRevenue(receitaItensAcc);

      // Despesas dentro do período selecionado (separadas em fixo e variável)
      let fixedSum = 0;
      let variableSum = 0;
      (expenses || []).forEach((e: any) => {
        if (!e.expense_date) return;
        const d = new Date(e.expense_date);
        if (d < start || d > end) return;
        const amount = Number(e.amount || 0);
        if (e.type === 'fixed') fixedSum += amount;
        else variableSum += amount;
      });
      setTotalExpenses(fixedSum + variableSum);
      setFixedExpenses(fixedSum);
      setVariableExpenses(variableSum);

      // Pending / status overview (mantido global, independente do período)
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

      // ============ ESTOQUE: valor atual + histórico ============
      // Unidades de estoque: variações quando existem, senão produto
      type Unit = { id: string; productId: string; variationId: string | null; stock: number; cost: number; price: number };
      const units: Unit[] = [];
      const variationsByProduct = new Map<string, any[]>();
      (productVariations || []).forEach((v: any) => {
        if (!variationsByProduct.has(v.product_id)) variationsByProduct.set(v.product_id, []);
        variationsByProduct.get(v.product_id)!.push(v);
      });
      (products || []).forEach((p: any) => {
        const vars = variationsByProduct.get(p.id) || [];
        if (vars.length > 0) {
          vars.forEach((v: any) => {
            const price = v.on_sale && v.sale_price ? Number(v.sale_price) : Number(v.price ?? p.price ?? 0);
            units.push({
              id: `${p.id}|${v.id}`,
              productId: p.id,
              variationId: v.id,
              stock: Number(v.stock || 0),
              cost: Number(v.cost ?? p.cost ?? 0),
              price,
            });
          });
        } else {
          const price = p.on_sale && p.sale_price ? Number(p.sale_price) : Number(p.price ?? 0);
          units.push({
            id: `${p.id}|`,
            productId: p.id,
            variationId: null,
            stock: Number(p.stock || 0),
            cost: Number(p.cost ?? 0),
            price,
          });
        }
      });

      const currentCostValue = units.reduce((s, u) => s + u.stock * u.cost, 0);
      const currentPriceValue = units.reduce((s, u) => s + u.stock * u.price, 0);
      const currentItems = units.reduce((s, u) => s + Math.max(0, u.stock), 0);
      setStockCostValue(currentCostValue);
      setStockPriceValue(currentPriceValue);
      setStockItemCount(currentItems);

      // Histórico: reconstruir estoque dia-a-dia desde end..start usando stock_movements
      const stockMovements: any[] = [];
      {
        const pageSize = 1000;
        let from2 = 0;
        while (true) {
          const { data: page, error } = await supabase
            .from('stock_movements')
            .select('product_id, variation_id, quantity_delta, created_at')
            .gte('created_at', start.toISOString())
            .order('created_at', { ascending: false })
            .range(from2, from2 + pageSize - 1);
          if (error) break;
          if (!page || page.length === 0) break;
          stockMovements.push(...page);
          if (page.length < pageSize) break;
          from2 += pageSize;
        }
      }

      // Mapa de estoque atual por unidade (mutável conforme desfazemos movimentações)
      const unitMap = new Map<string, Unit>();
      units.forEach((u) => unitMap.set(u.id, { ...u }));
      const keyOf = (pid: string, vid: string | null) => `${pid}|${vid ?? ''}`;

      // Construir dias do período (do mais recente para o mais antigo)
      const days: Date[] = [];
      const cursor = new Date(end);
      cursor.setHours(23, 59, 59, 999);
      const stopAt = new Date(start);
      stopAt.setHours(0, 0, 0, 0);
      while (cursor >= stopAt) {
        days.push(new Date(cursor));
        cursor.setDate(cursor.getDate() - 1);
      }

      // Movimentações ordenadas decrescente: para cada dia, desfaz movimentações posteriores ao fim daquele dia
      let movIdx = 0;
      const history: { date: string; costValue: number; priceValue: number; items: number }[] = [];
      for (const dayEnd of days) {
        // Desfazer todas movimentações que ocorreram APÓS dayEnd (já estão ordenadas desc)
        while (movIdx < stockMovements.length) {
          const m = stockMovements[movIdx];
          if (new Date(m.created_at) <= dayEnd) break;
          const k = keyOf(m.product_id, m.variation_id);
          const u = unitMap.get(k);
          if (u) u.stock = u.stock - Number(m.quantity_delta || 0);
          movIdx++;
        }
        let cVal = 0, pVal = 0, items = 0;
        unitMap.forEach((u) => {
          const s = Math.max(0, u.stock);
          cVal += s * u.cost;
          pVal += s * u.price;
          items += s;
        });
        history.push({
          date: dayEnd.toLocaleDateString('pt-BR'),
          costValue: cVal,
          priceValue: pVal,
          items,
        });
      }
      setStockHistory(history.reverse());

      // Vendas diárias dentro do período por canal
      const byDay: Record<string, SalesData> = {};

      delivered
        .filter((o) => {

          const d = new Date(o.created_at);
          return d >= start && d <= end;
        })
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

      // Top produtos por canal (apenas pedidos entregues no período)
      const aggregate = (filterFn: (item: any) => boolean) => {
        const acc: Record<string, ProductSales> = {};
        (orderItems || [])
          .filter(filterFn)
          .forEach((item: any) => {
            const product: any = productMap.get(item.product_id) || {};
            const variation: any = item.variation_id ? variationMap.get(item.variation_id) || {} : {};
            const name = variation.name || product.name || '—';
            const itemStock = item.variation_id
              ? Number(variation.stock || 0)
              : Number(product.stock || 0);
            if (!acc[name]) acc[name] = { name, quantity: 0, revenue: 0, stock: 0 };
            acc[name].quantity += Number(item.quantity || 0);
            acc[name].revenue += Number(item.quantity || 0) * parseFloat(item.price_at_purchase);
            acc[name].stock = itemStock;
          });
        return Object.values(acc)
          .filter((p) => p.stock > 0)
          .map((p) => ({ ...p, quantity: Math.round(p.quantity), revenue: Math.round(p.revenue * 100) / 100 }))
          .sort((a, b) => b.revenue - a.revenue);
      };

      setTopPdv(
        aggregate((i: any) => {
          const order = orderMap.get(i.order_id);
          if (!order) return false;
          const d = new Date(order.created_at);
          return order.status === 'entregado' && order.source === 'pdv' && d >= start && d <= end;
        })
      );
      setTopSite(
        aggregate((i: any) => {
          const order = orderMap.get(i.order_id);
          if (!order) return false;
          const d = new Date(order.created_at);
          return order.status === 'entregado' && order.source !== 'pdv' && d >= start && d <= end;
        })
      );

      // Ranking de clientes no período
      const customerMap = new Map((customers || []).map((c: any) => [c.id, c]));
      const customerAcc: Record<string, CustomerSales> = {};
      deliveredInRange.forEach((o: any) => {
        if (!o.customer_id) return;
        const c = customerMap.get(o.customer_id);
        const name = c?.full_name || 'Cliente sem nome';
        const doc = c?.cpf || c?.cnpj || '—';
        if (!customerAcc[o.customer_id]) {
          customerAcc[o.customer_id] = {
            id: o.customer_id,
            name,
            doc,
            score: Number(c?.score || 0),
            orders: 0,
            revenue: 0,
            lastOrder: null,
          };
        }
        const row = customerAcc[o.customer_id];
        row.orders += 1;
        row.revenue += parseFloat(String(o.total_amount)) + parseFloat(String(o.shipping_cost));
        const d = new Date(o.created_at).toISOString();
        if (!row.lastOrder || d > row.lastOrder) row.lastOrder = d;
      });
      setCustomersList(Object.values(customerAcc));
    } catch (error: any) {
      console.error('Erro ao carregar dashboard:', error);
      toast({ title: 'Erro ao carregar dados', description: error.message, variant: 'destructive' });
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
    const label = period === 'custom'
      ? `${format(range.from!, 'yyyy-MM-dd')}_${format(range.to!, 'yyyy-MM-dd')}`
      : `${period}d`;
    a.download = `dashboard-${label}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'CSV exportado!' });
  };

  if (loading || initialLoading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }
  if (!canView) return null;

  const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#ca8a04'];

  const rangeLabel = period === 'custom'
    ? `${format(range.from!, 'dd/MM/yyyy')} - ${format(range.to!, 'dd/MM/yyyy')}`
    : PERIODS[period].label;

  const StatCard = ({
    title, value, growth, icon, hint, formula,
  }: {
    title: string; value: string; growth?: number; icon: React.ReactNode; hint?: string; formula?: string;
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {formula && (
          <p className="text-[11px] text-muted-foreground/80 mt-1 font-mono">{formula}</p>
        )}
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

  const ProductTables = ({ products }: { products: ProductSales[] }) => {
    const [search, setSearch] = useState('');
    const term = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const filtered = products.filter((p) =>
      p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(term)
    );
    const byQuantity = [...filtered].sort((a, b) => b.quantity - a.quantity);
    const byRevenue = [...filtered].sort((a, b) => b.revenue - a.revenue);

    const Leaderboard = ({ list, sortKey }: { list: ProductSales[]; sortKey: 'quantity' | 'revenue' }) => {
      const total = list.reduce((s, p) => s + (sortKey === 'revenue' ? p.revenue : p.quantity), 0) || 1;
      return (
        <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
          {list.map((p, i) => {
            const rank = i + 1;
            const value = sortKey === 'revenue' ? p.revenue : p.quantity;
            const share = total > 0 ? (value / total) * 100 : 0;
            const isTop3 = rank <= 3;
            const rankClass =
              rank === 1
                ? 'bg-yellow-400 text-yellow-950 ring-2 ring-yellow-200'
                : rank === 2
                ? 'bg-slate-300 text-slate-900 ring-2 ring-slate-200'
                : rank === 3
                ? 'bg-amber-600 text-white ring-2 ring-amber-200'
                : 'bg-muted text-muted-foreground';
            return (
              <div
                key={i}
                className={`group flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 transition-all hover:shadow-sm hover:border-primary/30 ${isTop3 ? 'bg-primary/5' : ''}`}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${rankClass}`}>
                  {rank}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-sm" title={p.name}>{p.name}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {sortKey === 'revenue' ? formatBRL(p.revenue) : `${p.quantity.toLocaleString('pt-BR')} un`}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(share, 100)}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {sortKey === 'revenue'
                        ? `${p.quantity.toLocaleString('pt-BR')} vendidos`
                        : formatBRL(p.revenue)}
                    </span>
                    {p.stock <= 5 && p.stock > 0 && (
                      <Badge variant="outline" className="shrink-0 text-[10px] h-5 px-1.5 border-yellow-500/50 text-yellow-700">
                        Baixo estoque
                      </Badge>
                    )}
                    {p.stock <= 0 && (
                      <Badge variant="outline" className="shrink-0 text-[10px] h-5 px-1.5 border-red-500/50 text-red-700">
                        Sem estoque
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    };

    return (
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            {search ? 'Nenhum produto encontrado para esta busca.' : 'Nenhuma venda registrada neste canal ainda.'}
          </div>
        ) : (
          <Tabs defaultValue="revenue" className="space-y-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="revenue">Por valor</TabsTrigger>
              <TabsTrigger value="quantity">Por quantidade</TabsTrigger>
            </TabsList>
            <TabsContent value="revenue">
              <Leaderboard list={byRevenue} sortKey="revenue" />
            </TabsContent>
            <TabsContent value="quantity">
              <Leaderboard list={byQuantity} sortKey="quantity" />
            </TabsContent>
          </Tabs>
        )}
      </div>
    );
  };

  const CustomerTables = ({ customers }: { customers: CustomerSales[] }) => {
    const [search, setSearch] = useState('');
    const term = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const filtered = customers.filter((c) =>
      c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(term) ||
      c.doc.toLowerCase().replace(/\D/g, '').includes(term.replace(/\D/g, ''))
    );
    const byQuantity = [...filtered].sort((a, b) => b.orders - a.orders);
    const byRevenue = [...filtered].sort((a, b) => b.revenue - a.revenue);

    const Table = ({ list, sortKey }: { list: CustomerSales[]; sortKey: 'orders' | 'revenue' }) => (
      <div className="overflow-auto max-h-[460px]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-semibold w-12">#</th>
              <th className="px-3 py-2 text-left font-semibold">Cliente</th>
              <th className="px-3 py-2 text-right font-semibold w-24">Compras</th>
              <th className="px-3 py-2 text-right font-semibold w-36">Total</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c, i) => (
              <tr key={c.id} className="border-t border-border/60 hover:bg-muted/30">
                <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.doc}</div>
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${sortKey === 'orders' ? 'font-bold' : ''}`}>{c.orders}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${sortKey === 'revenue' ? 'font-bold' : ''}`}>{formatBRL(c.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

    return (
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente por nome ou documento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            {search ? 'Nenhum cliente encontrado para esta busca.' : 'Nenhum cliente comprou no período selecionado.'}
          </div>
        ) : (
          <Tabs defaultValue="revenue" className="space-y-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="revenue">Por valor</TabsTrigger>
              <TabsTrigger value="quantity">Por compras</TabsTrigger>
            </TabsList>
            <TabsContent value="revenue">
              <Table list={byRevenue} sortKey="revenue" />
            </TabsContent>
            <TabsContent value="quantity">
              <Table list={byQuantity} sortKey="orders" />
            </TabsContent>
          </Tabs>
        )}
      </div>
    );
  };

  const ChannelSection = ({
    title, icon, stats, color, dataKey, orderKey, top,
  }: {
    title: string; icon: React.ReactNode; stats: ChannelStats; color: string;
    dataKey: 'pdv' | 'site'; orderKey: 'pdvOrders' | 'siteOrders'; top: ProductSales[];
  }) => {
    return (
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
                <CardTitle>Receita Diária — {title} ({rangeLabel})</CardTitle>
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
                <CardTitle>Pedidos Diários — {title} ({rangeLabel})</CardTitle>
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
                <CardTitle>Produtos — {title}</CardTitle>
                <CardDescription>Produtos com maior receita neste canal</CardDescription>
              </CardHeader>
              <CardContent>
                <ProductTables products={top} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  };

  const totalRevenue = pdvStats.totalRevenue + siteStats.totalRevenue;
  const totalOrders = pdvStats.totalOrders + siteStats.totalOrders;
  const overallAvgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  // Lucro = Receita de itens entregues − Despesas gerais
  const lucroLiquido = itemsRevenue - totalExpenses;
  const margemLiquida = itemsRevenue > 0 ? (lucroLiquido / itemsRevenue) * 100 : 0;

  const customerRevenue = customersList.reduce((s, c) => s + c.revenue, 0);
  const customerOrders = customersList.reduce((s, c) => s + c.orders, 0);
  const customerAvgTicket = customerOrders > 0 ? customerRevenue / customerOrders : 0;
  const activeCustomers = customersList.length;

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
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    aria-label="Selecionar período"
                    className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground w-[240px] justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4" />
                      {rangeLabel}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4" align="end">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.entries(PERIODS).filter(([k]) => k !== 'custom') as [string, typeof PERIODS['30']][]).map(([k, v]) => (
                        <Button
                          key={k}
                          variant={period === k ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setPeriod(k as PeriodKey);
                            setDatePickerOpen(false);
                          }}
                        >
                          {v.label}
                        </Button>
                      ))}
                    </div>
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={range.from}
                      selected={range}
                      onSelect={(r) => {
                        if (r?.from && r?.to) {
                          setRange({ from: startOfDay(r.from), to: endOfDay(r.to) });
                          setPeriod('custom');
                        }
                      }}
                      numberOfMonths={2}
                    />
                    <Button
                      className="w-full"
                      onClick={() => setDatePickerOpen(false)}
                      disabled={!range?.from || !range?.to}
                    >
                      Confirmar período
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
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
        <Tabs defaultValue="geral" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="geral" className="gap-2">
              <LayoutDashboard className="h-4 w-4" /> Geral
            </TabsTrigger>
            <TabsTrigger value="financas" className="gap-2">
              <Wallet className="h-4 w-4" /> Finanças
            </TabsTrigger>
            <TabsTrigger value="estoque" className="gap-2">
              <Boxes className="h-4 w-4" /> Estoque
            </TabsTrigger>
            <TabsTrigger value="clientes" className="gap-2">
              <Users className="h-4 w-4" /> Clientes
            </TabsTrigger>

            <TabsTrigger value="pdv" className="gap-2">
              <Store className="h-4 w-4" /> PDV
            </TabsTrigger>
            <TabsTrigger value="site" className="gap-2">
              <Globe className="h-4 w-4" /> Site
            </TabsTrigger>
            <TabsTrigger value="traffic">Tráfego do Site</TabsTrigger>
          </TabsList>

          {/* ============ GERAL ============ */}
          <TabsContent value="geral" className="space-y-8">
            {/* linha 1: receita */}
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

            {/* linha 2: estoque & clientes */}
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
          </TabsContent>

          {/* ============ FINANÇAS ============ */}
          <TabsContent value="financas" className="space-y-6">
            {/* KPIs principais */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Receita (itens)"
                value={formatBRL(itemsRevenue)}
                hint={`+ Frete ${formatBRL(Math.max(0, totalRevenue - itemsRevenue))}`}
                icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
              />
              <StatCard
                title="Despesas"
                value={formatBRL(totalExpenses)}
                hint={`Fixas ${formatBRL(fixedExpenses)} · Var. ${formatBRL(variableExpenses)}`}
                icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
              />
              <StatCard
                title="Lucro Líquido"
                value={formatBRL(lucroLiquido)}
                hint={`Margem ${margemLiquida.toFixed(1)}%`}
                icon={<TrendingUp className={`h-4 w-4 ${lucroLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`} />}
              />
              <StatCard
                title="Ticket Médio"
                value={formatBRL(overallAvgTicket)}
                icon={<Target className="h-4 w-4 text-muted-foreground" />}
              />
            </div>

            {/* Gráficos lado a lado */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Comparativo */}
              <Card>
                <CardHeader>
                  <CardTitle>Resumo Financeiro</CardTitle>
                  <CardDescription>
                    Receita de itens entregues − Despesas Fixas/Variáveis = Lucro
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={[
                        { name: 'Receita', valor: itemsRevenue, fill: '#16a34a' },
                        { name: 'Desp. Fixas', valor: fixedExpenses, fill: '#f59e0b' },
                        { name: 'Desp. Variáveis', valor: variableExpenses, fill: '#ef4444' },
                        { name: 'Lucro', valor: lucroLiquido, fill: lucroLiquido >= 0 ? '#2563eb' : '#dc2626' },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => formatBRL(v)} />
                      <Bar dataKey="valor" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Composição da Receita */}
              <Card>
                <CardHeader>
                  <CardTitle>Origem da Receita</CardTitle>
                  <CardDescription>PDV vs Site</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'PDV', value: pdvStats.totalRevenue },
                          { name: 'Site', value: siteStats.totalRevenue },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={(e: any) => `${e.name}: ${formatBRL(e.value)}`}
                      >
                        <Cell fill="#2563eb" />
                        <Cell fill="#7c3aed" />
                      </Pie>
                      <Tooltip formatter={(v: number) => formatBRL(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Para onde foi o dinheiro */}
              <Card>
                <CardHeader>
                  <CardTitle>Para onde foi o dinheiro</CardTitle>
                  <CardDescription>Distribuição da receita</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Desp. Fixas', value: Math.max(0, fixedExpenses) },
                          { name: 'Desp. Variáveis', value: Math.max(0, variableExpenses) },
                          { name: 'Lucro', value: Math.max(0, lucroLiquido) },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={(e: any) => `${e.name}`}
                      >
                        <Cell fill="#f59e0b" />
                        <Cell fill="#ef4444" />
                        <Cell fill="#16a34a" />
                      </Pie>
                      <Tooltip formatter={(v: number) => formatBRL(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Evolução diária */}
              <Card>
                <CardHeader>
                  <CardTitle>Evolução da Receita</CardTitle>
                  <CardDescription>{rangeLabel}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart
                      data={salesData.map((d) => ({
                        date: d.date,
                        total: (d.pdv || 0) + (d.site || 0),
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => formatBRL(v)} />
                      <Line type="monotone" dataKey="total" stroke="#16a34a" strokeWidth={2} name="Receita" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>


          {/* ============ ESTOQUE ============ */}
          <TabsContent value="estoque" className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Valor de Custo"
                value={formatBRL(stockCostValue)}
                hint="Estoque atual × custo unitário"
                icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
              />
              <StatCard
                title="Valor de Venda"
                value={formatBRL(stockPriceValue)}
                hint="Estoque atual × preço de venda"
                icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
              />
              <StatCard
                title="Margem Potencial"
                value={formatBRL(stockPriceValue - stockCostValue)}
                hint={stockPriceValue > 0 ? `${(((stockPriceValue - stockCostValue) / stockPriceValue) * 100).toFixed(1)}% sobre venda` : '—'}
                icon={<TrendingUp className="h-4 w-4 text-green-600" />}
              />
              <StatCard
                title="Itens em Estoque"
                value={stockItemCount.toLocaleString('pt-BR')}
                hint="Soma de unidades disponíveis"
                icon={<Boxes className="h-4 w-4 text-muted-foreground" />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Histórico do Valor de Estoque</CardTitle>
                <CardDescription>
                  Custo vs. valor de venda ao longo do período ({rangeLabel})
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stockHistory.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    Sem movimentações no período — usando estoque atual.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={stockHistory}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => formatBRL(v)} />
                      <Legend />
                      <Line type="monotone" dataKey="costValue" stroke="#f59e0b" strokeWidth={2} name="Valor de Custo" dot={false} />
                      <Line type="monotone" dataKey="priceValue" stroke="#16a34a" strokeWidth={2} name="Valor de Venda" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Histórico de Quantidade em Estoque</CardTitle>
                <CardDescription>Total de unidades disponíveis por dia</CardDescription>
              </CardHeader>
              <CardContent>
                {stockHistory.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    Sem movimentações no período.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stockHistory}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip formatter={(v: number) => v.toLocaleString('pt-BR')} />
                      <Bar dataKey="items" fill="#2563eb" name="Unidades" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ CLIENTES ============ */}
          <TabsContent value="clientes" className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total de Clientes"
                value={String(totalCustomers)}
                icon={<Users className="h-4 w-4 text-muted-foreground" />}
              />
              <StatCard
                title="Clientes Ativos"
                value={String(activeCustomers)}
                hint="Compraram no período selecionado"
                icon={<Users className="h-4 w-4 text-primary" />}
              />
              <StatCard
                title="Receita de Clientes"
                value={formatBRL(customerRevenue)}
                icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
              />
              <StatCard
                title="Ticket Médio"
                value={formatBRL(customerAvgTicket)}
                icon={<Target className="h-4 w-4 text-muted-foreground" />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Clientes</CardTitle>
                <CardDescription>Ranking dos clientes que mais compraram no período</CardDescription>
              </CardHeader>
              <CardContent>
                <CustomerTables customers={customersList} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ PDV ============ */}

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

          {/* ============ SITE ============ */}
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

          {/* ============ TRÁFEGO ============ */}
          <TabsContent value="traffic">
            <SiteAnalytics rangeStart={range.from} rangeEnd={range.to} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
