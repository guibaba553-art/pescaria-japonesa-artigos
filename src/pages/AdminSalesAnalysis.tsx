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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft, CalendarIcon, Calculator, Download, Filter,
  ShoppingBag, Store, Globe, X, FileText, Clock, Ban, CheckCircle2,
  ChevronRight, ChevronDown, Loader2, Package, Receipt,
} from 'lucide-react';
import { format, isSameDay, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

type RowKind = 'order' | 'saved' | 'nfe';
type StatusGroup = 'concluido' | 'orcamento' | 'nota' | 'cancelado' | 'pendente';

interface OrderItem {
  id: string;
  product_id: string;
  variation_id: string | null;
  quantity: number;
  price_at_purchase: number;
  product_name: string | null;
  variation_name: string | null;
  sku: string | null;
  image_url: string | null;
}

interface UnifiedRow {
  id: string;
  kind: RowKind;
  source: string;            // 'site' | 'pdv' | 'nfe'
  total_amount: number;
  shipping_cost: number;
  status: string;
  statusGroup: StatusGroup;
  created_at: string;
  delivery_type: string;
  raw: any;
}

type DateMode = 'range' | 'multi' | 'single';
type SourceFilter = 'all' | 'site' | 'pdv';
type StatusFilter = 'all' | 'concluido' | 'orcamento' | 'nota' | 'cancelado' | 'pendente';

const STATUS_LABEL: Record<string, string> = {
  aguardando_pagamento: 'Aguardando',
  em_preparo: 'Em preparo',
  enviado: 'Enviado',
  entregado: 'Entregue',
  retirado: 'Retirado',
  cancelado: 'Cancelado',
  pronto_retirada: 'Pronto p/ retirada',
};

const PAYMENT_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro',
  cash: 'Dinheiro',
  pix: 'PIX',
  credit: 'Crédito',
  credit_card: 'Crédito',
  cartao_credito: 'Crédito',
  debit: 'Débito',
  debit_card: 'Débito',
  cartao_debito: 'Débito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  mercadopago: 'Mercado Pago',
};

function formatPayment(pm?: string | null): string {
  if (!pm) return '—';
  const k = String(pm).toLowerCase();
  return PAYMENT_LABEL[k] || String(pm);
}

// Maps order status -> visual group
function getOrderStatusGroup(status: string): StatusGroup {
  if (status === 'cancelado') return 'cancelado';
  if (status === 'aguardando_pagamento') return 'pendente';
  if (status === 'entregado' || status === 'retirado' || status === 'enviado') return 'concluido';
  return 'concluido'; // em_preparo, pronto_retirada => considered confirmed sales
}

const GROUP_META: Record<StatusGroup, { label: string; color: string; rowBg: string; dot: string }> = {
  concluido: {
    label: 'Concluído',
    color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40',
    rowBg: 'bg-emerald-500/5 hover:bg-emerald-500/10',
    dot: 'bg-emerald-500',
  },
  orcamento: {
    label: 'Orçamento',
    color: 'bg-amber-400/20 text-amber-700 dark:text-amber-400 border-amber-500/40',
    rowBg: 'bg-amber-400/5 hover:bg-amber-400/10',
    dot: 'bg-amber-500',
  },
  nota: {
    label: 'NF-e',
    color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/40',
    rowBg: 'bg-blue-500/5 hover:bg-blue-500/10',
    dot: 'bg-blue-500',
  },
  cancelado: {
    label: 'Cancelado',
    color: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40',
    rowBg: 'bg-red-500/5 hover:bg-red-500/10',
    dot: 'bg-red-500',
  },
  pendente: {
    label: 'Pendente',
    color: 'bg-muted text-muted-foreground border-border',
    rowBg: 'hover:bg-muted/40',
    dot: 'bg-muted-foreground',
  },
};

export default function AdminSalesAnalysis() {
  const navigate = useNavigate();
  const { user, isEmployee, isAdmin, permissions, loading } = useAuth();
  const canView = isAdmin || (isEmployee && permissions.sales_analysis);
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [fetching, setFetching] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<UnifiedRow | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
  const [emittingInvoice, setEmittingInvoice] = useState<Set<string>>(new Set());
  const [invoiceTarget, setInvoiceTarget] = useState<UnifiedRow | null>(null);

  const [dateMode, setDateMode] = useState<DateMode>('range');
  const [rangeFrom, setRangeFrom] = useState<Date | undefined>(() => startOfMonth(new Date()));
  const [rangeTo, setRangeTo] = useState<Date | undefined>(() => endOfMonth(new Date()));
  const [multiDays, setMultiDays] = useState<Date[]>([]);
  const [singleDay, setSingleDay] = useState<Date | undefined>(undefined);

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [autoLoaded, setAutoLoaded] = useState(false);

  useEffect(() => {
    if (!loading && !canView) navigate('/admin');
  }, [user, canView, loading, navigate]);

  // Carrega automaticamente as vendas do mês atual ao entrar na tela
  useEffect(() => {
    if (loading || autoLoaded) return;
    if (!canView) return;
    setAutoLoaded(true);
    fetchAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, canView]);

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

  const fetchAll = async (silent = false) => {
    if (!period) {
      if (!silent) toast.error('Selecione um período no calendário primeiro.');
      return;
    }
    setFetching(true);
    try {
      const fromIso = period.from.toISOString();
      const toIso = period.to.toISOString();

      const [ordersRes, savedRes, nfeRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, source, total_amount, shipping_cost, status, created_at, delivery_type, customer_id, user_id, payment_method')
          .gte('created_at', fromIso).lte('created_at', toIso),
        supabase
          .from('saved_sales')
          .select('id, total_amount, payment_method, created_at, user_id, customer_data, notes')
          .gte('created_at', fromIso).lte('created_at', toIso),
        supabase
          .from('nfe_emissions')
          .select('id, valor_total, status, tipo, created_at, emitted_at, nfe_number, nfe_key, order_id')
          .eq('tipo', 'saida')
          .gte('created_at', fromIso).lte('created_at', toIso),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (savedRes.error) throw savedRes.error;
      if (nfeRes.error) throw nfeRes.error;

      const unified: UnifiedRow[] = [];

      // Build map of orders that have at least one AUTHORIZED NF-e
      const ordersWithAuthorizedNfe = new Set<string>();
      const nfeMetaByOrder = new Map<string, { number: string | null; key: string | null }>();
      (nfeRes.data || []).forEach((n: any) => {
        const ok = ['success', 'autorizada', 'authorized', 'autorizado'].includes(
          String(n.status || '').toLowerCase()
        );
        if (ok && n.order_id) {
          ordersWithAuthorizedNfe.add(n.order_id);
          if (!nfeMetaByOrder.has(n.order_id)) {
            nfeMetaByOrder.set(n.order_id, { number: n.nfe_number, key: n.nfe_key });
          }
        }
      });

      (ordersRes.data || []).forEach((o: any) => {
        const hasNfe = ordersWithAuthorizedNfe.has(o.id);
        const baseGroup = getOrderStatusGroup(o.status);
        // If order has authorized NF-e and is not cancelled, classify as "nota" (blue)
        const finalGroup: StatusGroup =
          baseGroup !== 'cancelado' && hasNfe ? 'nota' : baseGroup;
        unified.push({
          id: o.id,
          kind: 'order',
          source: o.source,
          total_amount: Number(o.total_amount || 0),
          shipping_cost: Number(o.shipping_cost || 0),
          status: o.status,
          statusGroup: finalGroup,
          created_at: o.created_at,
          delivery_type: o.delivery_type,
          raw: { ...o, nfe: hasNfe ? nfeMetaByOrder.get(o.id) : null },
        });
      });

      (savedRes.data || []).forEach((s: any) => {
        unified.push({
          id: s.id,
          kind: 'saved',
          source: 'pdv',
          total_amount: Number(s.total_amount || 0),
          shipping_cost: 0,
          status: 'orcamento',
          statusGroup: 'orcamento',
          created_at: s.created_at,
          delivery_type: 'pdv',
          raw: s,
        });
      });

      (nfeRes.data || []).forEach((n: any) => {
        // Skip NFe linked to an order (avoid double-counting); show only standalone
        if (n.order_id) return;
        unified.push({
          id: n.id,
          kind: 'nfe',
          source: 'nfe',
          total_amount: Number(n.valor_total || 0),
          shipping_cost: 0,
          status: n.status === 'autorizada' ? 'autorizada' : n.status,
          statusGroup: n.status === 'cancelada' ? 'cancelado' : 'nota',
          created_at: n.created_at,
          delivery_type: 'nfe',
          raw: n,
        });
      });

      unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRows(unified);
      toast.success(`${unified.length} registro(s) carregado(s)`);
    } catch (e: any) {
      toast.error('Erro ao carregar: ' + e.message);
    } finally {
      setFetching(false);
    }
  };

  const filteredRows = useMemo(() => {
    let out = rows;

    if (dateMode === 'multi' && multiDays.length > 0) {
      out = out.filter((r) => multiDays.some((d) => isSameDay(new Date(r.created_at), d)));
    }

    if (sourceFilter !== 'all') {
      out = out.filter((r) => r.source === sourceFilter);
    }

    if (statusFilter !== 'all') {
      out = out.filter((r) => r.statusGroup === statusFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) => r.id.toLowerCase().includes(q));
    }

    return out;
  }, [rows, dateMode, multiDays, sourceFilter, statusFilter, search]);

  const summary = useMemo(() => {
    const sumGroup = (g: StatusGroup) =>
      filteredRows.filter((r) => r.statusGroup === g)
        .reduce((acc, r) => acc + r.total_amount, 0);
    const countGroup = (g: StatusGroup) =>
      filteredRows.filter((r) => r.statusGroup === g).length;

    const total = filteredRows
      .filter((r) => r.statusGroup === 'concluido' || r.statusGroup === 'nota')
      .reduce((acc, r) => acc + r.total_amount, 0);

    const totalSite = filteredRows
      .filter((r) => r.source === 'site' && (r.statusGroup === 'concluido' || r.statusGroup === 'nota'))
      .reduce((acc, r) => acc + r.total_amount, 0);
    const totalPdv = filteredRows
      .filter((r) => r.source === 'pdv' && (r.statusGroup === 'concluido' || r.statusGroup === 'nota'))
      .reduce((acc, r) => acc + r.total_amount, 0);

    return {
      total,
      totalSite,
      totalPdv,
      countSite: filteredRows.filter((r) => r.source === 'site').length,
      countPdv: filteredRows.filter((r) => r.source === 'pdv').length,
      concluido: { value: sumGroup('concluido'), count: countGroup('concluido') },
      orcamento: { value: sumGroup('orcamento'), count: countGroup('orcamento') },
      nota: { value: sumGroup('nota'), count: countGroup('nota') },
      cancelado: { value: sumGroup('cancelado'), count: countGroup('cancelado') },
    };
  }, [filteredRows]);

  const dailyGroups = useMemo(() => {
    const map = new Map<string, { date: Date; rows: UnifiedRow[]; total: number }>();
    filteredRows.forEach((r) => {
      const d = new Date(r.created_at);
      const key = format(d, 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, { date: d, rows: [], total: 0 });
      const g = map.get(key)!;
      g.rows.push(r);
      // only count confirmed sales toward day total
      if (r.statusGroup === 'concluido' || r.statusGroup === 'nota') {
        g.total += r.total_amount;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [filteredRows]);

  const formatCurrency = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const toggleExpand = async (row: UnifiedRow) => {
    const key = `${row.kind}-${row.id}`;
    const next = new Set(expandedRows);
    if (next.has(key)) {
      next.delete(key);
      setExpandedRows(next);
      return;
    }
    next.add(key);
    setExpandedRows(next);

    // Saved sales têm os itens dentro de cart_data
    if (row.kind === 'saved') {
      if (itemsByOrder[key]) return;
      const cart = (row.raw?.cart_data as any[]) || [];
      const items: OrderItem[] = cart.map((c: any, i: number) => ({
        id: `${key}-${i}`,
        product_id: c.id || c.product_id || '',
        variation_id: c.variation_id || null,
        quantity: Number(c.quantity || c.qty || 1),
        price_at_purchase: Number(c.price || c.unit_price || 0),
        product_name: c.name || c.product_name || 'Produto',
        variation_name: c.variation_name || null,
        sku: c.sku || null,
        image_url: c.image_url || c.image || (Array.isArray(c.images) ? c.images[0] : null) || null,
      }));
      setItemsByOrder((prev) => ({ ...prev, [key]: items }));
      return;
    }

    // Pedido normal: busca order_items
    if (row.kind === 'order') {
      if (itemsByOrder[key]) return;
      setLoadingItems((s) => new Set(s).add(key));
      try {
        const { data, error } = await supabase
          .from('order_items')
          .select('id, product_id, variation_id, quantity, price_at_purchase, products(name, sku, image_url, images), product_variations(name, image_url)')
          .eq('order_id', row.id);
        if (error) throw error;
        const items: OrderItem[] = (data || []).map((it: any) => {
          const variationImg = it.product_variations?.image_url || null;
          const productImg =
            it.products?.image_url ||
            (Array.isArray(it.products?.images) ? it.products.images[0] : null) ||
            null;
          return {
            id: it.id,
            product_id: it.product_id,
            variation_id: it.variation_id,
            quantity: it.quantity,
            price_at_purchase: Number(it.price_at_purchase || 0),
            product_name: it.products?.name || 'Produto removido',
            variation_name: it.product_variations?.name || null,
            sku: it.products?.sku || null,
            image_url: variationImg || productImg,
          };
        });
        setItemsByOrder((prev) => ({ ...prev, [key]: items }));
      } catch (e: any) {
        toast.error('Erro ao carregar itens: ' + e.message);
      } finally {
        setLoadingItems((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      }
    }
  };

  const exportCSV = () => {
    if (filteredRows.length === 0) {
      toast.error('Nada para exportar');
      return;
    }
    const header = ['ID', 'Data', 'Tipo', 'Origem', 'Status', 'Total'];
    const csvRows = filteredRows.map((r) => [
      r.id.slice(0, 8),
      format(new Date(r.created_at), 'dd/MM/yyyy HH:mm'),
      r.kind === 'nfe' ? 'NF-e' : r.kind === 'saved' ? 'Orçamento' : 'Pedido',
      r.source,
      GROUP_META[r.statusGroup].label,
      r.total_amount.toFixed(2).replace('.', ','),
    ]);
    const csv = [header, ...csvRows].map((r) => r.join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendas_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    setRangeFrom(undefined); setRangeTo(undefined);
    setMultiDays([]); setSingleDay(undefined);
    setRows([]);
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      if (cancelTarget.kind === 'order') {
        const { error } = await supabase
          .from('orders')
          .update({ status: 'cancelado' as any })
          .eq('id', cancelTarget.id);
        if (error) throw error;
      } else if (cancelTarget.kind === 'saved') {
        const { error } = await supabase
          .from('saved_sales')
          .delete()
          .eq('id', cancelTarget.id);
        if (error) throw error;
      } else {
        toast.error('Cancelamento de NF-e deve ser feito na tela fiscal.');
        setCancelling(false); setCancelTarget(null);
        return;
      }

      setRows((prev) => {
        if (cancelTarget.kind === 'saved') {
          return prev.filter((r) => r.id !== cancelTarget.id);
        }
        return prev.map((r) =>
          r.id === cancelTarget.id
            ? { ...r, status: 'cancelado', statusGroup: 'cancelado' as StatusGroup }
            : r
        );
      });
      toast.success(cancelTarget.kind === 'saved' ? 'Orçamento removido' : 'Pedido cancelado');
    } catch (e: any) {
      toast.error('Erro ao cancelar: ' + e.message);
    } finally {
      setCancelling(false);
      setCancelTarget(null);
    }
  };

  // Emite NFC-e (PDV / orçamento) ou NF-e (site) a partir do painel de Vendas.
  // Para pedidos do site (kind='order' source!='pdv') -> usa edge function 'emit-nfe' que aceita { orderId }.
  // Para pedidos PDV ou orçamentos salvos -> usa 'emit-nfce' montando o payload completo no client.
  const emitInvoice = async (row: UnifiedRow) => {
    const key = `${row.kind}-${row.id}`;
    setEmittingInvoice(prev => new Set(prev).add(key));
    const loadingToastId = toast.loading('Emitindo nota fiscal...', {
      description: 'Enviando dados para a SEFAZ. Pode levar alguns segundos.',
    });

    try {
      // Caminho 1: pedido do SITE -> NF-e (modelo 55)
      if (row.kind === 'order' && row.source !== 'pdv') {
        const { data, error } = await supabase.functions.invoke('emit-nfe', {
          body: { orderId: row.id },
        });
        if (error) {
          let msg: string | null = null;
          try {
            const ctx: any = (error as any).context;
            if (ctx?.clone && ctx?.json) {
              const parsed = await ctx.clone().json().catch(() => null);
              msg = parsed?.error || parsed?.message || null;
            }
          } catch { /* ignore */ }
          throw new Error(msg || error.message || 'Falha ao emitir NF-e');
        }
        if (data?.error) throw new Error(data.error);
        toast.success('NF-e emitida com sucesso! ✅', {
          id: loadingToastId,
          description: data?.nfe_number ? `Número: ${data.nfe_number}` : 'A nota fiscal foi gerada.',
        });
        await fetchAll(true);
        return;
      }

      // Caminho 2: pedido PDV -> NFC-e (modelo 65) com payload completo
      if (row.kind === 'order') {
        const [{ data: items, error: itemsErr }, { data: order, error: orderErr }] = await Promise.all([
          supabase
            .from('order_items')
            .select('quantity, price_at_purchase, product_id, products(name, ncm, cfop, csosn, origem, unidade_comercial, cest)')
            .eq('order_id', row.id),
          supabase
            .from('orders')
            .select('total_amount, customer_id, customers(full_name, cpf, cnpj, company_name)')
            .eq('id', row.id)
            .single(),
        ]);
        if (itemsErr) throw itemsErr;
        if (orderErr) throw orderErr;
        if (!items || items.length === 0) throw new Error('Pedido sem itens');

        const cust: any = (order as any).customers;
        const payload = {
          order_id: row.id,
          payment_method: 'dinheiro' as const,
          total_amount: Number((order as any).total_amount),
          customer: cust ? {
            cpf: cust.cpf || undefined,
            cnpj: cust.cnpj || undefined,
            nome: cust.company_name || cust.full_name || undefined,
          } : undefined,
          items: items.map((it: any) => ({
            product_id: it.product_id,
            name: it.products?.name || 'Produto',
            quantity: Number(it.quantity),
            unit_price: Number(it.price_at_purchase),
            ncm: it.products?.ncm || undefined,
            cfop: it.products?.cfop || undefined,
            csosn: it.products?.csosn || undefined,
            origem: it.products?.origem || undefined,
            unidade: it.products?.unidade_comercial || undefined,
            cest: it.products?.cest || undefined,
          })),
        };

        const { data, error } = await supabase.functions.invoke('emit-nfce', { body: payload });
        if (error) {
          let msg: string | null = null;
          try {
            const ctx: any = (error as any).context;
            if (ctx?.clone && ctx?.json) {
              const parsed = await ctx.clone().json().catch(() => null);
              msg = parsed?.error || parsed?.message || null;
            }
          } catch { /* ignore */ }
          throw new Error(msg || error.message || 'Falha ao emitir NFC-e');
        }
        if (data?.error) throw new Error(data.error);
        toast.success('NFC-e emitida com sucesso! ✅', {
          id: loadingToastId,
          description: data?.nfe_number ? `Número: ${data.nfe_number}` : 'A nota fiscal foi gerada.',
        });
        await fetchAll(true);
        return;
      }

      // Caminho 3: orçamento (saved_sales) -> monta NFC-e a partir de cart_data
      if (row.kind === 'saved') {
        const cart = Array.isArray(row.raw?.cart_data) ? row.raw.cart_data : [];
        if (cart.length === 0) throw new Error('Orçamento sem itens');

        // Buscar dados fiscais dos produtos
        const productIds = Array.from(new Set(cart.map((it: any) => it.id || it.product_id).filter(Boolean)));
        const { data: prods } = await supabase
          .from('products')
          .select('id, name, ncm, cfop, csosn, origem, unidade_comercial, cest')
          .in('id', productIds as string[]);
        const prodMap = new Map((prods || []).map((p: any) => [p.id, p]));

        const cd: any = row.raw?.customer_data || null;
        const payload = {
          order_id: undefined,
          payment_method: (row.raw?.payment_method || 'dinheiro') as any,
          total_amount: Number(row.total_amount),
          customer: cd ? {
            cpf: cd.cpf || undefined,
            cnpj: cd.cnpj || undefined,
            nome: cd.full_name || cd.company_name || cd.name || undefined,
          } : undefined,
          items: cart.map((it: any) => {
            const pid = it.id || it.product_id;
            const p: any = prodMap.get(pid) || {};
            return {
              product_id: pid,
              name: it.name || p.name || 'Produto',
              quantity: Number(it.quantity || 1),
              unit_price: Number(it.price ?? it.unit_price ?? 0),
              ncm: p.ncm || undefined,
              cfop: p.cfop || undefined,
              csosn: p.csosn || undefined,
              origem: p.origem || undefined,
              unidade: p.unidade_comercial || undefined,
              cest: p.cest || undefined,
            };
          }),
        };

        const { data, error } = await supabase.functions.invoke('emit-nfce', { body: payload });
        if (error) {
          let msg: string | null = null;
          try {
            const ctx: any = (error as any).context;
            if (ctx?.clone && ctx?.json) {
              const parsed = await ctx.clone().json().catch(() => null);
              msg = parsed?.error || parsed?.message || null;
            }
          } catch { /* ignore */ }
          throw new Error(msg || error.message || 'Falha ao emitir NFC-e');
        }
        if (data?.error) throw new Error(data.error);
        toast.success('NFC-e emitida com sucesso! ✅', {
          id: loadingToastId,
          description: data?.nfe_number ? `Número: ${data.nfe_number}` : 'A nota fiscal foi gerada.',
        });
        await fetchAll(true);
        return;
      }

      throw new Error('Tipo de venda não suporta emissão a partir daqui.');
    } catch (e: any) {
      console.error('Erro ao emitir nota:', e);
      toast.error('Erro ao emitir nota', {
        id: loadingToastId,
        description: e?.message || 'Verifique as configurações fiscais.',
      });
    } finally {
      setEmittingInvoice(prev => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });
      setInvoiceTarget(null);
    }
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
  if (!canView) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />

      <div className="bg-foreground text-background pt-20 lg:pt-32 pb-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider">Vendas</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-black tracking-tight">
                Análise de Vendas por Período
              </h1>
              <p className="text-sm text-background/60 mt-1">
                Pedidos, orçamentos e notas fiscais — filtre, some e cancele.
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
        {/* Filters */}
        <div className="bg-card border border-border rounded-2xl p-4 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-bold uppercase tracking-wider">Filtros</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
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
                    <Calendar mode="range" locale={ptBR}
                      selected={{ from: rangeFrom, to: rangeTo }}
                      onSelect={(r: any) => { setRangeFrom(r?.from); setRangeTo(r?.to); }}
                      numberOfMonths={2} />
                  )}
                  {dateMode === 'multi' && (
                    <Calendar mode="multiple" locale={ptBR}
                      selected={multiDays}
                      onSelect={(d: any) => setMultiDays(d || [])}
                      numberOfMonths={2} />
                  )}
                  {dateMode === 'single' && (
                    <Calendar mode="single" locale={ptBR} selected={singleDay} onSelect={setSingleDay} />
                  )}
                </PopoverContent>
              </Popover>
            </div>

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

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status</label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="concluido">🟢 Concluído</SelectItem>
                  <SelectItem value="nota">🔵 NF-e</SelectItem>
                  <SelectItem value="orcamento">🟡 Orçamento</SelectItem>
                  <SelectItem value="cancelado">🔴 Cancelado</SelectItem>
                  <SelectItem value="pendente">⚪ Pendente</SelectItem>
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
            <div className="flex gap-2 md:ml-auto flex-wrap">
              <Button onClick={() => fetchAll(false)} disabled={fetching || !period}>
                <Calculator className="w-4 h-4 mr-2" />
                {fetching ? 'Calculando...' : 'Somar'}
              </Button>
              <Button variant="outline" onClick={clearAll}>
                <X className="w-4 h-4 mr-2" /> Limpar
              </Button>
              <Button variant="outline" onClick={exportCSV} disabled={filteredRows.length === 0}>
                <Download className="w-4 h-4 mr-2" /> Exportar
              </Button>
            </div>
          </div>
        </div>

        {/* Summary */}
        {rows.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={CheckCircle2} label="Concluído" value={formatCurrency(summary.concluido.value)} sub={`${summary.concluido.count} venda(s)`} accent="bg-emerald-500/10 text-emerald-600" />
              <SummaryCard icon={FileText} label="Notas Fiscais" value={formatCurrency(summary.nota.value)} sub={`${summary.nota.count} nota(s)`} accent="bg-blue-500/10 text-blue-600" />
              <SummaryCard icon={Clock} label="Orçamentos" value={formatCurrency(summary.orcamento.value)} sub={`${summary.orcamento.count} salvo(s)`} accent="bg-amber-500/10 text-amber-600" />
              <SummaryCard icon={Ban} label="Cancelados" value={formatCurrency(summary.cancelado.value)} sub={`${summary.cancelado.count} canc.`} accent="bg-red-500/10 text-red-600" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <SummaryCard icon={ShoppingBag} label="Total Confirmado" value={formatCurrency(summary.total)} sub="Concluído + NF-e" accent="bg-primary/10 text-primary" />
              <SummaryCard icon={Globe} label="Site" value={formatCurrency(summary.totalSite)} sub={`${summary.countSite} registro(s)`} accent="bg-blue-500/10 text-blue-600" />
              <SummaryCard icon={Store} label="PDV" value={formatCurrency(summary.totalPdv)} sub={`${summary.countPdv} registro(s)`} accent="bg-emerald-500/10 text-emerald-600" />
            </div>
          </>
        )}

        {/* Empty states */}
        {dailyGroups.length === 0 && rows.length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-12 text-center">
            <CalendarIcon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              Selecione um período e clique em <strong>Somar</strong>.
            </p>
          </div>
        )}
        {dailyGroups.length === 0 && rows.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
            Nenhum registro corresponde aos filtros aplicados.
          </div>
        )}

        {/* Daily groups */}
        {dailyGroups.map((group) => (
          <div key={group.date.toISOString()} className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between bg-muted/40 px-4 md:px-6 py-3 border-b border-border">
              <div>
                <div className="font-display font-bold capitalize">
                  {format(group.date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </div>
                <div className="text-xs text-muted-foreground">{group.rows.length} registro(s)</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-primary">{formatCurrency(group.total)}</div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Confirmado no dia</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-2"></TableHead>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rows.map((r) => {
                    const meta = GROUP_META[r.statusGroup];
                    const canCancel =
                      (r.kind === 'order' && r.statusGroup !== 'cancelado') ||
                      r.kind === 'saved';
                    const expandKey = `${r.kind}-${r.id}`;
                    const isExpanded = expandedRows.has(expandKey);
                    const isLoadingItems = loadingItems.has(expandKey);
                    const items = itemsByOrder[expandKey];
                    const expandable = r.kind === 'order' || r.kind === 'saved';

                    return (
                      <>
                        <TableRow key={expandKey} className={meta.rowBg}>
                          <TableCell className="p-0 pl-0">
                            <div className={`w-1.5 h-10 ${meta.dot} rounded-r`} />
                          </TableCell>
                          <TableCell className="p-0 pl-1">
                            {expandable && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => toggleExpand(r)}
                                aria-label={isExpanded ? 'Recolher' : 'Expandir produtos'}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">#{r.id.slice(0, 8)}</TableCell>
                          <TableCell className="text-sm">{format(new Date(r.created_at), 'HH:mm')}</TableCell>
                          <TableCell>
                            <span className="text-xs font-medium">
                              {r.kind === 'nfe' ? 'NF-e' : r.kind === 'saved' ? 'Orçamento' : 'Pedido'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              r.source === 'pdv' ? 'border-emerald-500/40 text-emerald-600' :
                              r.source === 'nfe' ? 'border-blue-500/40 text-blue-600' :
                              'border-blue-500/40 text-blue-600'
                            }>
                              {r.source === 'pdv' ? 'PDV' : r.source === 'nfe' ? 'NF-e' : 'Site'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={meta.color}>
                              {meta.label}
                              {r.kind === 'order' && r.status !== 'cancelado' && (
                                <span className="ml-1 opacity-60">· {STATUS_LABEL[r.status] || r.status}</span>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-bold">{formatCurrency(r.total_amount)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {(() => {
                                const hasInvoice = r.statusGroup === 'nota' || !!r.raw?.nfe;
                                const isCancelled = r.statusGroup === 'cancelado';
                                const canEmit = !hasInvoice && !isCancelled && (r.kind === 'order' || r.kind === 'saved');
                                if (!canEmit) return null;
                                const isEmitting = emittingInvoice.has(`${r.kind}-${r.id}`);
                                return (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-blue-600 hover:text-blue-700 hover:bg-blue-500/10"
                                    onClick={() => setInvoiceTarget(r)}
                                    disabled={isEmitting}
                                  >
                                    {isEmitting ? (
                                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                    ) : (
                                      <Receipt className="w-3.5 h-3.5 mr-1" />
                                    )}
                                    {isEmitting ? 'Emitindo...' : 'Emitir Nota'}
                                  </Button>
                                );
                              })()}
                              {canCancel && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                                  onClick={() => setCancelTarget(r)}
                                >
                                  <Ban className="w-3.5 h-3.5 mr-1" />
                                  {r.kind === 'saved' ? 'Excluir' : 'Cancelar'}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow key={`${expandKey}-expand`} className={meta.rowBg}>
                            <TableCell colSpan={9} className="p-0">
                              <div className="bg-muted/30 border-t border-border px-6 py-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <Package className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Produtos do {r.kind === 'saved' ? 'orçamento' : 'pedido'}
                                  </span>
                                </div>

                                {isLoadingItems && (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Carregando produtos...
                                  </div>
                                )}

                                {!isLoadingItems && items && items.length === 0 && (
                                  <div className="text-sm text-muted-foreground py-3">
                                    Nenhum produto encontrado neste registro.
                                  </div>
                                )}

                                {!isLoadingItems && items && items.length > 0 && (
                                  <div className="rounded-lg border border-border bg-background overflow-hidden">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Produto</TableHead>
                                          <TableHead>SKU</TableHead>
                                          <TableHead className="text-right">Qtd</TableHead>
                                          <TableHead className="text-right">Preço Unit.</TableHead>
                                          <TableHead className="text-right">Subtotal</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {items.map((it) => (
                                          <TableRow key={it.id}>
                                            <TableCell>
                                              <div className="flex items-center gap-3">
                                                {it.image_url ? (
                                                  <img
                                                    src={it.image_url}
                                                    alt={it.product_name || 'Produto'}
                                                    className="w-12 h-12 rounded-md object-cover border border-border bg-muted flex-shrink-0"
                                                    loading="lazy"
                                                    onError={(e) => {
                                                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                    }}
                                                  />
                                                ) : (
                                                  <div className="w-12 h-12 rounded-md border border-border bg-muted flex items-center justify-center flex-shrink-0">
                                                    <Package className="w-5 h-5 text-muted-foreground/50" />
                                                  </div>
                                                )}
                                                <div className="min-w-0">
                                                  <div className="font-medium text-sm">{it.product_name}</div>
                                                  {it.variation_name && (
                                                    <div className="text-xs text-muted-foreground">
                                                      Variação: {it.variation_name}
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                              {it.sku || '—'}
                                            </TableCell>
                                            <TableCell className="text-right">{it.quantity}</TableCell>
                                            <TableCell className="text-right text-sm">
                                              {formatCurrency(it.price_at_purchase)}
                                            </TableCell>
                                            <TableCell className="text-right font-bold">
                                              {formatCurrency(it.price_at_purchase * it.quantity)}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {cancelTarget?.kind === 'saved' ? 'Excluir orçamento?' : 'Cancelar pedido?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.kind === 'saved'
                ? 'Esta venda salva (orçamento) será removida permanentemente.'
                : 'O pedido será marcado como cancelado e deixará de contar nas somatórias de vendas confirmadas.'}
              {cancelTarget && (
                <div className="mt-3 p-3 bg-muted rounded-lg text-sm">
                  <div><strong>ID:</strong> #{cancelTarget.id.slice(0, 8)}</div>
                  <div><strong>Total:</strong> {formatCurrency(cancelTarget.total_amount)}</div>
                  <div><strong>Data:</strong> {format(new Date(cancelTarget.created_at), 'dd/MM/yyyy HH:mm')}</div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {cancelling ? 'Processando...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!invoiceTarget} onOpenChange={(o) => !o && setInvoiceTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Emitir nota fiscal?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {invoiceTarget?.kind === 'order' && invoiceTarget?.source !== 'pdv'
                  ? 'Será emitida uma NF-e (modelo 55) para este pedido do site.'
                  : 'Será emitida uma NFC-e (modelo 65) para esta venda.'}
                {' '}A operação envia os dados à SEFAZ — pode levar alguns segundos.
                {invoiceTarget && (
                  <div className="mt-3 p-3 bg-muted rounded-lg text-sm space-y-1">
                    <div><strong>Tipo:</strong> {invoiceTarget.kind === 'saved' ? 'Orçamento' : 'Pedido'} {invoiceTarget.source === 'pdv' ? '(PDV)' : invoiceTarget.kind === 'order' ? '(Site)' : ''}</div>
                    <div><strong>ID:</strong> #{invoiceTarget.id.slice(0, 8)}</div>
                    <div><strong>Data:</strong> {format(new Date(invoiceTarget.created_at), 'dd/MM/yyyy HH:mm')}</div>
                    <div><strong>Total:</strong> {formatCurrency(invoiceTarget.total_amount)}</div>
                    <div><strong>Documento a emitir:</strong> {invoiceTarget.kind === 'order' && invoiceTarget.source !== 'pdv' ? 'NF-e (55)' : 'NFC-e (65)'}</div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={!!invoiceTarget && emittingInvoice.has(`${invoiceTarget.kind}-${invoiceTarget.id}`)}
            >
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => invoiceTarget && emitInvoice(invoiceTarget)}
              disabled={!!invoiceTarget && emittingInvoice.has(`${invoiceTarget.kind}-${invoiceTarget.id}`)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {invoiceTarget && emittingInvoice.has(`${invoiceTarget.kind}-${invoiceTarget.id}`) ? 'Emitindo...' : 'Emitir agora'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
