import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, CalendarIcon, Calculator, Download, Filter,
  ShoppingBag, Store, Globe, X,
} from 'lucide-react';
import { format, isSameDay, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface SaleRow {
  id: string;
  source: string;
  total_amount: number;
  shipping_cost: number;
  status: string;
  created_at: string;
  delivery_type: string;
  customer_id: string | null;
  user_id: string;
}

type DateMode = 'range' | 'multi' | 'single';
type SourceFilter = 'all' | 'site' | 'pdv';
type StatusFilter = 'all' | 'paid' | 'cancelled';

const STATUS_LABEL: Record<string, string> = {
  aguardando_pagamento: 'Aguardando',
  em_preparo: 'Em preparo',
  enviado: 'Enviado',
  entregado: 'Entregue',
  cancelado: 'Cancelado',
  pronto_retirada: 'Pronto p/ retirada',
};

const STATUS_COLOR: Record<string, string> = {
  aguardando_pagamento: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  em_preparo: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  enviado: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/30',
  entregado: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  cancelado: 'bg-red-500/15 text-red-600 border-red-500/30',
  pronto_retirada: 'bg-cyan-500/15 text-cyan-600 border-cyan-500/30',
};

export default function AdminSalesAnalysis() {
  const navigate = useNavigate();
  const { user, isEmployee, isAdmin, loading } = useAuth();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [fetching, setFetching] = useState(false);

  const [dateMode, setDateMode] = useState<DateMode>('range');
  const [rangeFrom, setRangeFrom] = useState<Date | undefined>(undefined);
  const [rangeTo, setRangeTo] = useState<Date | undefined>(undefined);
  const [multiDays, setMultiDays] = useState<Date[]>([]);
  const [singleDay, setSingleDay] = useState<Date | undefined>(undefined);

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('paid');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!loading && !isEmployee && !isAdmin) navigate('/auth');
  }, [user, isEmployee, isAdmin, loading, navigate]);

  // ---- Effective period (used for query) ----
  const period = useMemo(() => {
    if (dateMode === 'range' && rangeFrom) {
      return { from: startOfDay(rangeFrom), to: endOfDay(rangeTo || rangeFrom) };
    }
    if (dateMode === 'single' && singleDay) {
      return { from: startOfDay(singleDay), to: endOfDay(singleDay) };
    }
    if (dateMode === 'multi' && multiDays.length > 0) {
      const sorted = [...multiDays].sort((a, b) => a.getTime() - b.getTime());
      return { from: startOfDay(sorted[0]), to: endOfDay(sorted[sorted.length - 1]) };
    }
    return null;
  }, [dateMode, rangeFrom, rangeTo, multiDays, singleDay]);

  const fetchSales = async () => {
    if (!period) {
      toast.error('Selecione um período no calendário primeiro.');
      return;
    }
    setFetching(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, source, total_amount, shipping_cost, status, created_at, delivery_type, customer_id, user_id')
        .gte('created_at', period.from.toISOString())
        .lte('created_at', period.to.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSales((data || []) as SaleRow[]);
      toast.success(`${data?.length || 0} vendas carregadas`);
    } catch (e: any) {
      toast.error('Erro ao carregar vendas: ' + e.message);
    } finally {
      setFetching(false);
    }
  };

  // ---- Apply post-filters (multi-day exact, source, status, search) ----
  const filteredSales = useMemo(() => {
    let rows = sales;

    if (dateMode === 'multi' && multiDays.length > 0) {
      rows = rows.filter((s) =>
        multiDays.some((d) => isSameDay(new Date(s.created_at), d))
      );
    }

    if (sourceFilter !== 'all') {
      rows = rows.filter((s) => s.source === sourceFilter);
    }

    if (statusFilter === 'paid') {
      rows = rows.filter((s) => s.status !== 'cancelado' && s.status !== 'aguardando_pagamento');
    } else if (statusFilter === 'cancelled') {
      rows = rows.filter((s) => s.status === 'cancelado');
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((s) => s.id.toLowerCase().includes(q));
    }

    return rows;
  }, [sales, dateMode, multiDays, sourceFilter, statusFilter, search]);

  // ---- Summaries ----
  const summary = useMemo(() => {
    const total = filteredSales.reduce((acc, s) => acc + Number(s.total_amount || 0), 0);
    const totalSite = filteredSales
      .filter((s) => s.source === 'site')
      .reduce((acc, s) => acc + Number(s.total_amount || 0), 0);
    const totalPdv = filteredSales
      .filter((s) => s.source === 'pdv')
      .reduce((acc, s) => acc + Number(s.total_amount || 0), 0);
    const countSite = filteredSales.filter((s) => s.source === 'site').length;
    const countPdv = filteredSales.filter((s) => s.source === 'pdv').length;
    const ticket = filteredSales.length > 0 ? total / filteredSales.length : 0;
    return { total, totalSite, totalPdv, countSite, countPdv, ticket };
  }, [filteredSales]);

  // ---- Group by day ----
  const dailyGroups = useMemo(() => {
    const map = new Map<string, { date: Date; sales: SaleRow[]; total: number }>();
    filteredSales.forEach((s) => {
      const d = new Date(s.created_at);
      const key = format(d, 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, { date: d, sales: [], total: 0 });
      const g = map.get(key)!;
      g.sales.push(s);
      g.total += Number(s.total_amount || 0);
    });
    return Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [filteredSales]);

  const formatCurrency = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const exportCSV = () => {
    if (filteredSales.length === 0) {
      toast.error('Nenhuma venda para exportar');
      return;
    }
    const header = ['ID', 'Data', 'Origem', 'Status', 'Tipo', 'Total', 'Frete'];
    const rows = filteredSales.map((s) => [
      s.id.slice(0, 8),
      format(new Date(s.created_at), 'dd/MM/yyyy HH:mm'),
      s.source,
      STATUS_LABEL[s.status] || s.status,
      s.delivery_type,
      Number(s.total_amount).toFixed(2).replace('.', ','),
      Number(s.shipping_cost).toFixed(2).replace('.', ','),
    ]);
    const csv = [header, ...rows].map((r) => r.join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendas_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    setRangeFrom(undefined);
    setRangeTo(undefined);
    setMultiDays([]);
    setSingleDay(undefined);
    setSales([]);
  };

  const periodLabel = useMemo(() => {
    if (dateMode === 'range' && rangeFrom) {
      return rangeTo
        ? `${format(rangeFrom, 'dd/MM/yy')} a ${format(rangeTo, 'dd/MM/yy')}`
        : format(rangeFrom, 'dd/MM/yyyy');
    }
    if (dateMode === 'single' && singleDay) return format(singleDay, 'dd/MM/yyyy');
    if (dateMode === 'multi' && multiDays.length > 0) return `${multiDays.length} dias selecionados`;
    return 'Selecionar período';
  }, [dateMode, rangeFrom, rangeTo, multiDays, singleDay]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!isEmployee && !isAdmin) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />

      {/* Banner */}
      <div className="bg-foreground text-background pt-20 lg:pt-32 pb-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider">ADM · Análise</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-black tracking-tight">
                Análise de Vendas por Período
              </h1>
              <p className="text-sm text-background/60 mt-1">
                Selecione dias específicos ou um intervalo e some todas as vendas (Site + PDV).
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate('/admin')}
              className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground self-start md:self-end"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao Painel
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 -mt-4 space-y-6">
        {/* Filter bar */}
        <div className="bg-card border border-border rounded-2xl p-4 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-bold uppercase tracking-wider">Filtros</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Date mode */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Modo de seleção</label>
              <Select value={dateMode} onValueChange={(v) => { clearAll(); setDateMode(v as DateMode); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="range">Intervalo (de-até)</SelectItem>
                  <SelectItem value="multi">Vários dias avulsos</SelectItem>
                  <SelectItem value="single">Um único dia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date picker */}
            <div className="lg:col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Período</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {periodLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  {dateMode === 'range' && (
                    <Calendar
                      mode="range"
                      locale={ptBR}
                      selected={{ from: rangeFrom, to: rangeTo }}
                      onSelect={(r: any) => { setRangeFrom(r?.from); setRangeTo(r?.to); }}
                      numberOfMonths={2}
                    />
                  )}
                  {dateMode === 'multi' && (
                    <Calendar
                      mode="multiple"
                      locale={ptBR}
                      selected={multiDays}
                      onSelect={(d: any) => setMultiDays(d || [])}
                      numberOfMonths={2}
                    />
                  )}
                  {dateMode === 'single' && (
                    <Calendar
                      mode="single"
                      locale={ptBR}
                      selected={singleDay}
                      onSelect={setSingleDay}
                    />
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Source */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Origem</label>
              <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="site">Apenas Site</SelectItem>
                  <SelectItem value="pdv">Apenas PDV</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status</label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Confirmadas</SelectItem>
                  <SelectItem value="all">Todas (incl. pendentes)</SelectItem>
                  <SelectItem value="cancelled">Apenas canceladas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 mt-4">
            <Input
              placeholder="Buscar por ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="md:max-w-xs"
            />
            <div className="flex gap-2 md:ml-auto">
              <Button onClick={fetchSales} disabled={fetching || !period}>
                <Calculator className="w-4 h-4 mr-2" />
                {fetching ? 'Calculando...' : 'Somar'}
              </Button>
              <Button variant="outline" onClick={clearAll}>
                <X className="w-4 h-4 mr-2" />
                Limpar
              </Button>
              <Button variant="outline" onClick={exportCSV} disabled={filteredSales.length === 0}>
                <Download className="w-4 h-4 mr-2" />
                Exportar
              </Button>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        {sales.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard
              icon={ShoppingBag}
              label="Total Geral"
              value={formatCurrency(summary.total)}
              sub={`${filteredSales.length} venda(s)`}
              accent="bg-primary/10 text-primary"
            />
            <SummaryCard
              icon={Globe}
              label="Vendas Site"
              value={formatCurrency(summary.totalSite)}
              sub={`${summary.countSite} venda(s)`}
              accent="bg-blue-500/10 text-blue-600"
            />
            <SummaryCard
              icon={Store}
              label="Vendas PDV"
              value={formatCurrency(summary.totalPdv)}
              sub={`${summary.countPdv} venda(s)`}
              accent="bg-emerald-500/10 text-emerald-600"
            />
            <SummaryCard
              icon={Calculator}
              label="Ticket Médio"
              value={formatCurrency(summary.ticket)}
              sub="por venda"
              accent="bg-amber-500/10 text-amber-600"
            />
          </div>
        )}

        {/* Daily groups */}
        {dailyGroups.length === 0 && sales.length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-12 text-center">
            <CalendarIcon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              Selecione um período no calendário e clique em <strong>Somar</strong> para ver as vendas.
            </p>
          </div>
        )}

        {dailyGroups.length === 0 && sales.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
            Nenhuma venda corresponde aos filtros aplicados.
          </div>
        )}

        {dailyGroups.map((group) => (
          <div key={group.date.toISOString()} className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between bg-muted/40 px-4 md:px-6 py-3 border-b border-border">
              <div>
                <div className="font-display font-bold capitalize">
                  {format(group.date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </div>
                <div className="text-xs text-muted-foreground">{group.sales.length} venda(s)</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-primary">{formatCurrency(group.total)}</div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Total do dia</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Frete</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.sales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">#{s.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-sm">{format(new Date(s.created_at), 'HH:mm')}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={s.source === 'pdv' ? 'border-emerald-500/40 text-emerald-600' : 'border-blue-500/40 text-blue-600'}>
                          {s.source === 'pdv' ? 'PDV' : 'Site'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_COLOR[s.status] || ''}>
                          {STATUS_LABEL[s.status] || s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground capitalize">{s.delivery_type}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(Number(s.shipping_cost || 0))}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(Number(s.total_amount))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon, label, value, sub, accent,
}: {
  icon: any; label: string; value: string; sub: string; accent: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-display font-black">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}
