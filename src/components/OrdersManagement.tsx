import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Package, Truck, CheckCircle, ChevronDown, ChevronRight, Clock, PackageCheck, RefreshCw, Printer, Receipt, Loader2, Search, Calendar as CalendarIcon, X, XCircle, Undo2, Store, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MelhorEnvioLabelDialog } from '@/components/MelhorEnvioLabelDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { classifyCancelledOrder, getCancellationReasonConfig, getGatewayUrl, statusConfig, getStatusLabel, getNextStatus, getNextStatusLabel } from '@/lib/orderStatus';
import type { CancelledCategory } from '@/lib/orderStatus';
import { TriagemSection } from '@/components/admin/TriagemSection';
function ConfirmReturnDialogContent({
  order, customerName, customerCpf, onConfirm,
}: {
  order: any;
  customerName: string;
  customerCpf: string;
  onConfirm: (isDefect: boolean) => void;
}) {
  const [isDefect, setIsDefect] = useState(false);
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Confirmar recebimento da devolução</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div>
            O produto retornou à loja? Ao confirmar, o pedido será marcado como <strong>devolvido</strong> e o <strong>estoque será reposto automaticamente</strong>.
            <div className="mt-3 p-3 bg-muted rounded-md text-sm space-y-1">
              <div><strong>Pedido:</strong> #{order.id.slice(0, 8)}</div>
              <div><strong>Cliente:</strong> {customerName}</div>
              <div><strong>CPF:</strong> {customerCpf}</div>
              <div><strong>Total:</strong> R$ {Number(order.total_amount).toFixed(2)}</div>
              <div><strong>Itens a repor no estoque:</strong> {order.order_items.length}</div>
            </div>
            <label className="mt-3 flex items-start gap-2 p-3 rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 cursor-pointer">
              <Checkbox checked={isDefect} onCheckedChange={(v) => setIsDefect(!!v)} className="mt-0.5" />
              <div className="text-sm">
                <span className="font-semibold">Devolução por defeito do produto</span>
                <div className="text-xs text-muted-foreground">Marque se foi por defeito — o cliente <strong>não perderá pontos</strong> na sua classificação.</div>
              </div>
            </label>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancelar</AlertDialogCancel>
        <AlertDialogAction
          onClick={() => onConfirm(isDefect)}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          Confirmar devolução
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

function ConfirmPickupReturnDialogContent({
  order, customerName, customerCpf, onConfirm, isRefunding, hasPayment, gwLabel, methodLabel,
}: {
  order: any;
  customerName: string;
  customerCpf: string;
  onConfirm: (isDefect: boolean, shouldRefund: boolean) => void;
  isRefunding: boolean;
  hasPayment: boolean;
  gwLabel: string;
  methodLabel: string;
}) {
  const [isDefect, setIsDefect] = useState(false);
  const [shouldRefund, setShouldRefund] = useState(hasPayment);
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Confirmar devolução (retirada na loja)</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div>
            <p className="mb-3">
              O cliente trouxe o produto de volta à loja? Ao confirmar, o pedido será marcado como <strong>devolvido</strong> e o <strong>estoque será reposto automaticamente</strong>.
            </p>
            <div className="p-3 bg-muted rounded-md text-sm space-y-1">
              <div><strong>Pedido:</strong> #{order.id.slice(0, 8)}</div>
              <div><strong>Cliente:</strong> {customerName}</div>
              <div><strong>CPF:</strong> {customerCpf}</div>
              <div><strong>Total:</strong> R$ {Number(order.total_amount).toFixed(2)}</div>
              <div><strong>Itens a repor no estoque:</strong> {order.order_items.length}</div>
            </div>
            <label className="mt-3 flex items-start gap-2 p-3 rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 cursor-pointer">
              <Checkbox checked={isDefect} onCheckedChange={(v) => setIsDefect(!!v)} className="mt-0.5" />
              <div className="text-sm">
                <span className="font-semibold">Devolução por defeito do produto</span>
                <div className="text-xs text-muted-foreground">Marque se foi por defeito — o cliente <strong>não perderá pontos</strong> na sua classificação.</div>
              </div>
            </label>
            {hasPayment && (
              <label className="mt-3 flex items-start gap-2.5 p-3 rounded-md border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20 cursor-pointer">
                <Checkbox checked={shouldRefund} onCheckedChange={(v) => setShouldRefund(!!v)} className="mt-0.5" />
                <div className="text-sm">
                  <span className="font-semibold">Estornar pagamento automaticamente</span>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Valor de <strong>R$ {Number(order.total_amount).toFixed(2)}</strong> será devolvido ao cliente via {gwLabel || 'gateway'}.
                    {order.payment_method === 'credit_card' || order.card_brand ? ' Para cartão, aparece na próxima fatura (1–2 ciclos).' : ''}
                  </div>
                </div>
              </label>
            )}
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancelar</AlertDialogCancel>
        <AlertDialogAction
          onClick={() => onConfirm(isDefect, shouldRefund)}
          disabled={isRefunding}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          {isRefunding ? 'Processando...' : 'Confirmar Devolução'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

interface OrderItem {
  id: string;
  quantity: number;
  price_at_purchase: number;
  product_id: string;
  products: {
    name: string;
  };
}

interface NFEEmission {
  id: string;
  nfe_number: string | null;
  nfe_key: string | null;
  nfe_xml_url: string | null;
  status: string;
  emitted_at: string | null;
  error_message: string | null;
}

interface Order {
  id: string;
  total_amount: number;
  shipping_cost: number;
  status: 'aguardando_pagamento' | 'em_preparo' | 'aguardando_envio' | 'enviado' | 'entregado' | 'retirado' | 'pronto_retirada' | 'cancelado' | 'devolucao_solicitada' | 'devolvido' | 'reembolsado';
  created_at: string;
  user_id: string;
  shipping_cep: string;
  delivery_type: 'delivery' | 'pickup';
  source?: 'site' | 'pdv';
  tracking_code?: string;
  shipping_label_url?: string | null;
  shipping_label_order_id?: string | null;
  payment_id?: string | null;
  payment_gateway?: string | null;
  payment_method?: string | null;
  asaas_payment_id?: string | null;
  card_brand?: string | null;
  card_last_digits?: string | null;
  qr_code_base64?: string | null;
  order_items: OrderItem[];
  nfe_emissions?: NFEEmission[];
  refunded_amount?: number;
  cancellation_reason?: string;
}

interface Profile {
  full_name: string;
  cpf: string | null;
}

// Diálogo de cancelamento de pedido — admin deve fornecer uma razão
function CancelOrderDialog({
  orderId,
  customerName,
  totalAmount,
  paymentMethodLabel,
  gwLabel,
  cardBrand,
  cardLastDigits,
  onCancel,
}: {
  orderId: string;
  customerName: string;
  totalAmount: number;
  paymentMethodLabel?: string;
  gwLabel?: string;
  cardBrand?: string;
  cardLastDigits?: string;
  onCancel: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    if (!reason.trim()) return;
    onCancel(reason.trim());
    setOpen(false);
    setReason('');
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive h-8 border border-destructive/30 rounded-md">
          <X className="h-4 w-4" />
          Cancelar Pedido
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar Pedido</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              <p className="mb-3">Tem certeza que deseja cancelar este pedido? Esta ação não pode ser desfeita.</p>
              <div className="p-3 bg-muted rounded-md text-sm space-y-1 mb-3">
                <div><strong>Pedido:</strong> #{orderId.slice(0, 8)}</div>
                <div><strong>Cliente:</strong> {customerName}</div>
                <div><strong>Total:</strong> R$ {totalAmount.toFixed(2)}</div>
                {(paymentMethodLabel || gwLabel) && (
                  <div><strong>Pagamento:</strong> {paymentMethodLabel ? `${paymentMethodLabel}${gwLabel ? ` via ${gwLabel}` : ''}` : gwLabel || ''}{cardBrand ? ` ${cardBrand}` : ''}{cardLastDigits ? ` final ${cardLastDigits}` : ''}</div>
                )}
              </div>
              <label className="text-sm font-medium">Motivo do cancelamento</label>
              <textarea
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Descreva o motivo do cancelamento..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!reason.trim()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Confirmar Cancelamento
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Diálogo de cancelamento com verificação automática de estorno
export function CancelOrderWithRefundDialog({
  order,
  customerName,
  gwLabel,
  methodLabel,
  onCancel,
  isProcessing,
}: {
  order: any;
  customerName: string;
  gwLabel: string;
  methodLabel: string;
  onCancel: (reason: string) => Promise<void>;
  isProcessing: boolean;
}) {
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [dialogProcessing, setDialogProcessing] = useState(false);

  const handleConfirm = async () => {
    if (!reason.trim()) return;
    setError('');
    setDialogProcessing(true);
    try {
      await onCancel(reason.trim());
      setOpen(false);
      setReason('');
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Ocorreu um erro ao cancelar o pedido. Tente novamente.');
    } finally {
      setDialogProcessing(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(''); }}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive h-8 border border-destructive/30 rounded-md">
          <X className="h-4 w-4" />
          Cancelar Pedido
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar Pedido</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              <p className="mb-3">Tem certeza que deseja cancelar este pedido? Esta ação não pode ser desfeita.</p>
              <div className="p-3 bg-muted rounded-md text-sm space-y-1 mb-3">
                <div><strong>Pedido:</strong> #{order.id.slice(0, 8)}</div>
                <div><strong>Cliente:</strong> {customerName}</div>
                <div><strong>Total:</strong> R$ {Number(order.total_amount).toFixed(2)}</div>
                <div><strong>Pagamento:</strong> {methodLabel ? `${methodLabel}${gwLabel ? ` via ${gwLabel}` : ''}` : gwLabel || ''}{order.card_brand ? ` ${order.card_brand}` : ''}{order.card_last_digits ? ` final ${order.card_last_digits}` : ''}</div>
              </div>

              <div className="p-3 rounded-md border border-blue-500/40 bg-blue-50 dark:bg-blue-950/20 mb-3">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  O sistema verificará o pagamento e estornará automaticamente se confirmado.
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-md border border-red-500/40 bg-red-50 dark:bg-red-950/20 mb-3">
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}

              <label className="text-sm font-medium block">Motivo do cancelamento</label>
              <textarea
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Descreva o motivo do cancelamento..."
                value={reason}
                onChange={(e) => { setReason(e.target.value); setError(''); }}
                rows={3}
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!reason.trim() || isProcessing || dialogProcessing}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isProcessing || dialogProcessing ? 'Processando...' : 'Confirmar Cancelamento'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const OrdersTable = ({ 
  orders, 
  profiles, 
  expandedOrders, 
  toggleOrderExpansion,
  updateOrderStatus,
  verifyPayment,
  trackingCodes,
  setTrackingCodes,
  updateTrackingCode,
  emitNFCe,
  emittingNFCe,
  refundPayment,
  refundingOrders,
  cancellingOrders,
  cancelOrder,
  openLabelDialog,
}: {
  orders: Order[];
  profiles: Record<string, { name: string; cpf: string }>;
  expandedOrders: Set<string>;
  toggleOrderExpansion: (orderId: string) => void;
  updateOrderStatus: (orderId: string, newStatus: Order['status'], extra?: Record<string, any>) => void;
  verifyPayment: (orderId: string) => void;
  trackingCodes: Record<string, string>;
  setTrackingCodes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  updateTrackingCode: (orderId: string) => void;
  emitNFCe: (orderId: string) => void;
  emittingNFCe: Set<string>;
  refundPayment: (orderId: string) => void;
  refundingOrders: Set<string>;
  cancellingOrders: Set<string>;
  cancelOrder: (orderId: string, reason: string) => void;
  openLabelDialog: (order: Order) => void;
}) => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'today' | '7days' | '30days' | 'all'>('all');
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  const toggleDay = (dayKey: string) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
  };

  // Aplica filtros (busca + data)
  const filteredOrders = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let cutoff: Date | null = null;
    if (dateFilter === 'today') cutoff = startOfToday;
    else if (dateFilter === '7days') cutoff = new Date(startOfToday.getTime() - 6 * 86400000);
    else if (dateFilter === '30days') cutoff = new Date(startOfToday.getTime() - 29 * 86400000);

    const q = searchQuery.trim().toLowerCase();

    return orders.filter(o => {
      if (cutoff && new Date(o.created_at) < cutoff) return false;
      if (!q) return true;
      const customerName = (profiles[o.user_id]?.name || '').toLowerCase();
      const cpf = (profiles[o.user_id]?.cpf || '').toLowerCase();
      const idShort = o.id.slice(0, 8).toLowerCase();
      return (
        customerName.includes(q) ||
        cpf.includes(q) ||
        idShort.includes(q) ||
        o.id.toLowerCase().includes(q) ||
        (o.tracking_code || '').toLowerCase().includes(q)
      );
    });
  }, [orders, searchQuery, dateFilter, profiles]);

  // Agrupa por dia
  const groupedByDay = useMemo(() => {
    const groups: Record<string, { label: string; date: Date; orders: Order[]; total: number }> = {};
    for (const o of filteredOrders) {
      const d = new Date(o.created_at);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!groups[dayKey]) {
        const today = new Date();
        const yesterday = new Date(today.getTime() - 86400000);
        const isToday = d.toDateString() === today.toDateString();
        const isYesterday = d.toDateString() === yesterday.toDateString();
        const formatted = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
        const label = isToday ? `Hoje • ${formatted}` : isYesterday ? `Ontem • ${formatted}` : formatted;
        groups[dayKey] = { label, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), orders: [], total: 0 };
      }
      groups[dayKey].orders.push(o);
      groups[dayKey].total += Number(o.total_amount);
    }
    return Object.entries(groups)
      .sort((a, b) => b[1].date.getTime() - a[1].date.getTime())
      .map(([key, value]) => ({ key, ...value }));
  }, [filteredOrders]);

  const FiltersBar = (
    <div className="flex flex-col sm:flex-row gap-2 mb-4">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, CPF, ID do pedido ou código de rastreio..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <Select value={dateFilter} onValueChange={(v: any) => setDateFilter(v)}>
        <SelectTrigger className="w-full sm:w-[200px]">
          <CalendarIcon className="w-4 h-4 mr-2" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Hoje</SelectItem>
          <SelectItem value="7days">Últimos 7 dias</SelectItem>
          <SelectItem value="30days">Últimos 30 dias</SelectItem>
          <SelectItem value="all">Todos</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground rounded-xl border border-dashed bg-muted/30">
        <Package className="w-14 h-14 mb-3 opacity-40" />
        <p className="text-sm font-medium">Nenhum pedido nesta categoria</p>
        <p className="text-xs opacity-70 mt-1">Os pedidos aparecerão aqui assim que forem criados</p>
      </div>
    );
  }

  if (filteredOrders.length === 0) {
    return (
      <div>
        {FiltersBar}
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-xl border border-dashed bg-muted/30">
          <Search className="w-12 h-12 mb-3 opacity-40" />
          <p className="text-sm font-medium">Nenhum pedido encontrado</p>
          <p className="text-xs opacity-70 mt-1">Ajuste os filtros para ver mais resultados</p>
        </div>
      </div>
    );
  }

  const renderOrderCard = (order: Order) => {
    const isExpanded = expandedOrders.has(order.id);
    const cfg = statusConfig[order.status];
    const StatusIcon = cfg.icon;
    const nextStatus = getNextStatus(order.status, order.delivery_type);
    const customerName = profiles[order.user_id]?.name || 'Carregando...';
    const customerCpf = profiles[order.user_id]?.cpf || 'N/A';
    const gwLabel = order.payment_gateway === 'asaas' ? 'Asaas' : order.payment_gateway === 'mercadopago' ? 'Mercado Pago' : order.payment_gateway || '';
    const methodLabel = order.payment_method === 'pix' ? 'PIX' : order.payment_method === 'credit_card' ? 'Cartão de Crédito' : order.payment_method === 'debit_card' ? 'Cartão de Débito' : order.card_brand ? 'Cartão de Crédito' : order.qr_code_base64 ? 'PIX' : order.payment_method || '';

    return (
      <Collapsible key={order.id} open={isExpanded} onOpenChange={() => toggleOrderExpansion(order.id)} asChild>
            <Card className={`border-l-4 ${cfg.accentClass} transition-all hover:shadow-md overflow-hidden`}>
              {/* Header do card */}
              <div className="p-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${cfg.badgeClass} border`}>
                    <StatusIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">#{order.id.slice(0, 8)}</span>
                      <Badge variant="outline" className={`${cfg.badgeClass} border text-[10px] font-semibold uppercase tracking-wide`}>
                        {getStatusLabel(order.status, order.delivery_type)}
                      </Badge>
                      {order.delivery_type === 'pickup' ? (
                        <Badge variant="outline" className="text-xs font-semibold px-3 py-1 flex items-center gap-1.5 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                          <Store className="w-4 h-4" /> Retirada
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs font-semibold px-3 py-1 flex items-center gap-1.5 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
                          <Truck className="w-4 h-4" /> Entrega
                        </Badge>
                      )}
                      {order.nfe_emissions && order.nfe_emissions.length > 0 && (() => {
                        const latestNfe = order.nfe_emissions[order.nfe_emissions.length - 1];
                        const nfeStatusColor: Record<string, string> = {
                          autorizada: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
                          authorized: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
                          pendente: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
                          pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
                          rejeitada: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
                          rejected: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
                          error: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
                          cancelada: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30',
                          cancelled: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30',
                        };
                        const colorClass = nfeStatusColor[latestNfe.status] || 'bg-muted text-muted-foreground border-border';
                        return (
                          <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wide ${colorClass}`}>
                            <Receipt className="w-3 h-3 mr-1" />
                            NF-e {latestNfe.nfe_number ? `Nº ${latestNfe.nfe_number}` : latestNfe.status}
                          </Badge>
                        );
                      })()}
                      {order.status === 'cancelado' && order.cancellation_reason && order.cancellation_reason !== 'prazo_expirado' && order.cancellation_reason !== 'cancelado_admin' && (
                        <Badge variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 text-[10px] font-semibold px-2 py-0.5 max-w-[200px] truncate">
                          {order.cancellation_reason}
                        </Badge>
                      )}
                    </div>
                    <p className="font-semibold text-base mt-1 truncate">{customerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold text-primary leading-tight">
                    R$ {order.total_amount.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {order.order_items.length} {order.order_items.length === 1 ? 'item' : 'itens'}
                  </p>
                </div>
              </div>

              {/* Meta row */}
              <div className="px-4 pb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground border-t pt-3">
                <span><span className="opacity-70">Nome:</span> <span className="font-mono">{customerName}</span></span>
                <span><span className="opacity-70">CPF:</span> <span className="font-mono">{customerCpf}</span></span>
                <span><span className="opacity-70">CEP:</span> <span className="font-mono">{order.shipping_cep || 'N/A'}</span></span>
                <span>
                  <span className="opacity-70">Pagamento:</span>{' '}
                  <span className="font-mono">
                    {methodLabel || gwLabel || '—'}
                    {methodLabel && gwLabel ? ` via ${gwLabel}` : ''}
                    {order.card_brand ? ` ${order.card_brand}` : ''}
                    {order.card_last_digits ? ` final ${order.card_last_digits}` : ''}
                  </span>
                </span>
              </div>

              {/* Ações */}
              <div className="px-4 pb-4 flex items-center gap-1.5 md:gap-2 flex-wrap">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'}
                  </Button>
                </CollapsibleTrigger>

                {order.status === 'aguardando_pagamento' && (
                  <Button size="sm" variant="outline" onClick={() => verifyPayment(order.id)} className="gap-1">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Verificar Pagamento
                  </Button>
                )}

        {nextStatus && (
                  <Button
                    size="sm"
                    onClick={() => updateOrderStatus(order.id, nextStatus)}
                    className="gap-1"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    {getNextStatusLabel(order.status, order.delivery_type)}
                  </Button>
                )}

                {order.source !== 'pdv' && order.delivery_type === 'delivery' && (order.status === 'em_preparo' || order.status === 'enviado') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openLabelDialog(order)}
                    className="gap-1 border-blue-500/40 text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
                  >
                    <Truck className="h-3.5 w-3.5" />
                    {order.shipping_label_order_id ? 'Imprimir Etiqueta' : order.tracking_code ? 'Nova Etiqueta' : 'Gerar Etiqueta'}
                  </Button>
                )}

                {order.source === 'pdv' && order.status === 'entregado' && !order.nfe_emissions?.some(n => n.status === 'success') && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => emitNFCe(order.id)}
                    disabled={emittingNFCe.has(order.id)}
                    className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {emittingNFCe.has(order.id) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Receipt className="h-3.5 w-3.5" />
                    )}
                    {emittingNFCe.has(order.id) ? 'Emitindo...' : 'Emitir NFC-e'}
                  </Button>
                )}

                {order.status === 'entregado' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 border-orange-500/40 text-orange-600 hover:bg-orange-500/10 dark:text-orange-400"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Solicitar Devolução
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Solicitar devolução do pedido</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div>
                            O cliente solicitou a devolução? Ao confirmar, o pedido entra em <strong>trânsito de devolução</strong> e aguarda o produto retornar à loja. Quando chegar, basta clicar em "Confirmar Devolução" — o estoque será reposto automaticamente.
                            <div className="mt-3 p-3 bg-muted rounded-md text-sm space-y-1">
                              <div><strong>Pedido:</strong> #{order.id.slice(0, 8)}</div>
                              <div><strong>Cliente:</strong> {customerName}</div>
                              <div><strong>CPF:</strong> {customerCpf}</div>
                              <div><strong>Total:</strong> R$ {order.total_amount.toFixed(2)}</div>
                              <div><strong>Itens:</strong> {order.order_items.length} {order.order_items.length === 1 ? 'item' : 'itens'}</div>
                              <div><strong>Tipo:</strong> Entrega</div>
                            </div>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => updateOrderStatus(order.id, 'devolucao_solicitada')}
                          className="bg-orange-600 hover:bg-orange-700 text-white"
                        >
                          Solicitar devolução
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {order.status === 'retirado' && (() => {
                  const hasPayment = !!(order.payment_gateway && (order.payment_id || order.asaas_payment_id));
                  const gwLabel = order.payment_gateway === 'asaas' ? 'Asaas' : order.payment_gateway === 'mercadopago' ? 'Mercado Pago' : order.payment_gateway || '';
                  const methodLabel = order.payment_method === 'pix' ? 'PIX' : order.payment_method === 'credit_card' ? 'Cartão de Crédito' : order.payment_method === 'debit_card' ? 'Cartão de Débito' : order.card_brand ? 'Cartão de Crédito' : order.qr_code_base64 ? 'PIX' : order.payment_method || '';
                  return (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                          Confirmar Devolução
                        </Button>
                      </AlertDialogTrigger>
                      <ConfirmPickupReturnDialogContent
                        order={order}
                        customerName={customerName}
                        customerCpf={customerCpf}
                        onConfirm={(isDefect, shouldRefund) => {
                          if (shouldRefund) {
                            refundPayment(order.id);
                          }
                          updateOrderStatus(order.id, 'devolvido', { return_is_defect: isDefect });
                        }}
                        isRefunding={refundingOrders.has(order.id)}
                        hasPayment={hasPayment}
                        gwLabel={gwLabel}
                        methodLabel={methodLabel}
                      />
                    </AlertDialog>
                  );
                })()}

                {order.status === 'devolucao_solicitada' && (
                  <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          className="gap-1 bg-red-600 hover:bg-red-700 text-white"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          Confirmar Devolução
                        </Button>
                      </AlertDialogTrigger>
                      <ConfirmReturnDialogContent
                        order={order}
                        customerName={customerName}
                        customerCpf={customerCpf}
                        onConfirm={(isDefect) =>
                          updateOrderStatus(order.id, 'devolvido', { return_is_defect: isDefect })
                        }
                      />
                    </AlertDialog>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => updateOrderStatus(order.id, order.delivery_type === 'pickup' ? 'retirado' : 'entregado')}
                      className="gap-1 text-muted-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancelar solicitação
                    </Button>
                  </>
                )}

                {/* Botão Estornar — disponível em devolvido + cancelado quando há pagamento online */}
                {(order.status === 'devolvido' || order.status === 'cancelado') && (order.payment_id || order.payment_gateway) && (() => {
                  const refunded = order.refunded_amount ?? 0;
                  const remaining = Number(order.total_amount) - refunded;
                  const fullyRefunded = remaining <= 0.01;
                  const isLoading = refundingOrders.has(order.id);
                  const gwLabel = order.payment_gateway === 'asaas' ? 'Asaas' : order.payment_gateway === 'mercadopago' ? 'Mercado Pago' : order.payment_gateway || 'gateway';
                  const methodLabel = order.payment_method === 'pix' ? 'PIX' : order.payment_method === 'credit_card' ? 'Cartão de Crédito' : order.payment_method === 'debit_card' ? 'Cartão de Débito' : order.card_brand ? 'Cartão de Crédito' : order.qr_code_base64 ? 'PIX' : order.payment_method || 'online';
                  return (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          disabled={fullyRefunded || isLoading}
                          className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                        >
                          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                          {fullyRefunded ? 'Estornado' : isLoading ? 'Estornando...' : 'Estornar dinheiro'}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Estornar pagamento ao cliente</AlertDialogTitle>
                          <AlertDialogDescription asChild>
                            <div>
                              O valor será devolvido ao cliente diretamente pelo <strong>{gwLabel}</strong>. Para PIX o estorno é imediato. Para cartão, aparece na próxima fatura (1–2 ciclos).
                              <div className="mt-3 p-3 bg-muted rounded-md text-sm space-y-1">
                                <div><strong>Pedido:</strong> #{order.id.slice(0, 8)}</div>
                                <div><strong>Cliente:</strong> {customerName}</div>
                                <div><strong>Método:</strong> {methodLabel}{order.card_brand ? ` ${order.card_brand}` : ''}{order.card_last_digits ? ` final ${order.card_last_digits}` : ''}</div>
                                <div><strong>Total do pedido:</strong> R$ {Number(order.total_amount).toFixed(2)}</div>
                                {refunded > 0 && (
                                  <div><strong>Já estornado:</strong> R$ {refunded.toFixed(2)}</div>
                                )}
                                <div className="text-emerald-700 dark:text-emerald-400">
                                  <strong>A estornar agora:</strong> R$ {remaining.toFixed(2)}
                                </div>
                              </div>
                              <div className="mt-3 text-xs text-muted-foreground">
                                Esta ação não pode ser desfeita.
                              </div>
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => refundPayment(order.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            Confirmar estorno
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  );
                })()}

                <div>
                {(order.status === 'aguardando_pagamento' || order.status === 'em_preparo' || order.status === 'pronto_retirada') && (
                  (() => {
                    const hasPayment = !!(order.payment_gateway && (order.payment_id || order.asaas_payment_id));
                    const gwLabel = order.payment_gateway === 'asaas' ? 'Asaas' : order.payment_gateway === 'mercadopago' ? 'Mercado Pago' : order.payment_gateway || '';
                    const methodLabel = order.payment_method === 'pix' ? 'PIX' : order.payment_method === 'credit_card' ? 'Cartão de Crédito' : order.payment_method === 'debit_card' ? 'Cartão de Débito' : order.card_brand ? 'Cartão de Crédito' : order.qr_code_base64 ? 'PIX' : order.payment_method || '';

                    return hasPayment ? (
                      // Cancelamento com verificação automática de estorno
                      <CancelOrderWithRefundDialog
                          order={order}
                          customerName={customerName}
                          gwLabel={gwLabel}
                          methodLabel={methodLabel}
                          onCancel={async (reason) => { await cancelOrder(order.id, reason); }}
                          isProcessing={cancellingOrders.has(order.id)}
                        />
                      ) : (
                        <CancelOrderDialog
                          orderId={order.id}
                          customerName={customerName}
                          totalAmount={order.total_amount}
                          paymentMethodLabel={methodLabel}
                          gwLabel={gwLabel}
                          cardBrand={order.card_brand}
                          cardLastDigits={order.card_last_digits}
                          onCancel={(reason) => updateOrderStatus(order.id, 'cancelado', { cancellation_reason: reason })}
                        />
                      );
                    })()
                  )}
                </div>
              </div>

              {/* Detalhes expandidos */}
              <CollapsibleContent>
                <div className="px-4 pb-4 pt-0 space-y-4 bg-muted/30 border-t">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                    {/* Itens */}
                    <div>
                      <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Itens do Pedido</h4>
                      <div className="space-y-1.5">
                        {order.order_items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between p-2.5 bg-background rounded-lg border text-sm">
                            <div className="min-w-0 flex-1 pr-2">
                              <p className="font-medium truncate">{item.products.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.quantity} × R$ {item.price_at_purchase.toFixed(2)}
                              </p>
                            </div>
                            <p className="font-semibold text-sm shrink-0">
                              R$ {(item.quantity * item.price_at_purchase).toFixed(2)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Resumo */}
                    <div>
                      <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Resumo</h4>
                      <div className="bg-background rounded-lg border p-3 space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span>R$ {(order.total_amount - order.shipping_cost).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Frete</span>
                          <span>R$ {order.shipping_cost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold pt-2 border-t mt-1">
                          <span>Total</span>
                          <span className="text-primary">R$ {order.total_amount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Reembolso — exibido para pedidos cancelados com pagamento */}
                  {order.status === 'cancelado' && (order.payment_gateway || order.payment_id) && (
                    <div className="bg-background rounded-lg border p-3">
                      <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                        💰 Reembolso
                      </h4>
                      {(() => {
                        const gwName = order.payment_gateway === 'asaas' ? 'Asaas' : order.payment_gateway === 'mercadopago' ? 'Mercado Pago' : order.payment_gateway || 'Gateway';
                        const methodName = order.payment_method === 'pix' ? 'PIX' : order.payment_method === 'credit_card' ? 'Cartão de Crédito' : order.payment_method === 'debit_card' ? 'Cartão de Débito' : order.payment_method || 'Online';
                        const refunded = order.refunded_amount ?? 0;
                        const total = Number(order.total_amount);
                        const fullyRefunded = refunded >= total - 0.01;
                        return (
                          <div className="space-y-2 text-sm">
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase">Provedor</p>
                                <p className="font-semibold">{gwName}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase">Método</p>
                                <p className="font-semibold">
                                  {methodName}
                                  {order.card_brand ? ` ${order.card_brand}` : ''}
                                  {order.card_last_digits ? ` final ${order.card_last_digits}` : ''}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase">Status</p>
                                <Badge
                                  variant={fullyRefunded ? 'secondary' : 'outline'}
                                  className={fullyRefunded ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'}
                                >
                                  {fullyRefunded ? '✅ Reembolsado' : '⏳ Pendente'}
                                </Badge>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase">Valor total</p>
                                <p className="font-semibold">R$ {total.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase">Estornado</p>
                                <p className="font-semibold text-emerald-600 dark:text-emerald-400">R$ {refunded.toFixed(2)}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* NF-e */}
                  {order.nfe_emissions && order.nfe_emissions.length > 0 && (
                    <div className="px-4 pb-3 space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Receipt className="w-3.5 h-3.5" /> Notas Fiscais
                      </h4>
                      {order.nfe_emissions.map((nfe: any) => {
                        const nfeStatusColor: Record<string, string> = {
                          autorizada: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
                          authorized: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
                          pendente: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
                          pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
                          rejeitada: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
                          rejected: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
                          error: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
                          cancelada: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30',
                          cancelled: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30',
                        };
                        const colorClass = nfeStatusColor[nfe.status] || 'bg-muted text-muted-foreground border-border';
                        return (
                          <div key={nfe.id} className="flex items-center justify-between gap-2 text-sm bg-muted/40 rounded-md px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge variant="outline" className={`text-[10px] ${colorClass}`}>
                                {nfe.status}
                              </Badge>
                              {nfe.nfe_number && (
                                <span className="font-mono text-xs">Nº {nfe.nfe_number}</span>
                              )}
                              {nfe.emitted_at && (
                                <span className="text-xs text-muted-foreground">
                                  {new Date(nfe.emitted_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {nfe.nfe_xml_url && (
                                <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                                  <a href={nfe.nfe_xml_url} target="_blank" rel="noopener noreferrer">XML</a>
                                </Button>
                              )}
                              {nfe.danfe_url && (
                                <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                                  <a href={nfe.danfe_url} target="_blank" rel="noopener noreferrer">
                                    <Printer className="w-3 h-3 mr-1" /> DANFE
                                  </a>
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Rastreio */}
                  {order.status === 'enviado' && (
                    <div className="bg-background rounded-lg border p-3">
                      <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Código de Rastreio</h4>
                      <div className="flex gap-2">
                        <Input
                          value={trackingCodes[order.id] || order.tracking_code || ''}
                          onChange={(e) => setTrackingCodes(prev => ({ ...prev, [order.id]: e.target.value }))}
                          placeholder="Digite o código de rastreio"
                          className="flex-1"
                        />
                        <Button
                          onClick={() => updateTrackingCode(order.id)}
                          size="sm"
                          disabled={!trackingCodes[order.id] || trackingCodes[order.id] === order.tracking_code}
                        >
                          Salvar
                        </Button>
                      </div>
                      {order.tracking_code && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Código atual: <span className="font-mono font-semibold">{order.tracking_code}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
    );
  };

  return (
    <div>
      {FiltersBar}
      <div className="space-y-4">
        {groupedByDay.map((group) => {
          const isCollapsed = collapsedDays.has(group.key);
          return (
            <div key={group.key} className="space-y-3">
              <button
                onClick={() => toggleDay(group.key)}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-muted/50 hover:bg-muted rounded-lg border transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isCollapsed ? <ChevronRight className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
                  <CalendarIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="font-semibold text-sm capitalize truncate">{group.label}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="secondary" className="text-xs">
                    {group.orders.length} {group.orders.length === 1 ? 'pedido' : 'pedidos'}
                  </Badge>
                  <span className="text-sm font-bold text-primary">
                    R$ {group.total.toFixed(2)}
                  </span>
                </div>
              </button>
              {!isCollapsed && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {group.orders.map(renderOrderCard)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

function CancelledOrderCard({
  order,
  customerName,
  customerCpf,
  isExpanded,
  onToggleExpand,
  onRefund,
  isRefunding,
  refundHistoryRecords,
  isLoadingHistory,
}: {
  order: Order;
  customerName: string;
  customerCpf: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRefund: (orderId: string) => void;
  isRefunding: boolean;
  refundHistoryRecords?: any[];
  isLoadingHistory: boolean;
}) {
  const [verifyingGateway, setVerifyingGateway] = useState(false);
  const { toast } = useToast();
  const category = classifyCancelledOrder(order);
  const reasonCfg = getCancellationReasonConfig(order.cancellation_reason);
  const gatewayUrl = getGatewayUrl(order.payment_gateway, order.payment_id || order.asaas_payment_id);
  const hasPayment = !!(order.payment_gateway && (order.payment_id || order.asaas_payment_id));
  const refunded = order.refunded_amount ?? 0;
  const total = Number(order.total_amount);

  const gwName = order.payment_gateway === 'asaas' ? 'Asaas' : order.payment_gateway === 'mercadopago' ? 'Mercado Pago' : order.payment_gateway || '';
  const methodName = order.payment_method === 'pix' ? 'PIX' : order.payment_method === 'credit_card' ? 'Cartão de Crédito' : order.payment_method === 'debit_card' ? 'Cartão de Débito' : order.payment_method || 'Online';
  const cardDetail = order.card_brand ? ` ${order.card_brand}` : '';
  const cardLastDigits = order.card_last_digits ? ` final ${order.card_last_digits}` : '';

  const accentClass = category === 'needs_refund' ? 'border-l-amber-500' : category === 'no_payment' ? 'border-l-gray-400' : 'border-l-emerald-500';

  const statusBadge = category === 'needs_refund'
    ? { label: 'Cancelado · Estorno pendente', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' }
    : category === 'no_payment'
    ? { label: 'Cancelado · Sem cobrança', className: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30' }
    : { label: 'Reembolsado', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' };

  const statusIcon = category === 'needs_refund' ? '⚠️' : category === 'no_payment' ? '⏹' : '✅';
  const statusText = category === 'needs_refund'
    ? `Pendente · R$ ${(total - refunded).toFixed(2)} a estornar`
    : category === 'no_payment'
    ? (hasPayment ? 'Cobrança não confirmada · estorno não se aplica' : 'Nenhuma cobrança registrada')
    : `Concluído · R$ ${refunded.toFixed(2)} estornado`;

  return (
    <Collapsible key={order.id} open={isExpanded} onOpenChange={onToggleExpand} asChild>
      <Card className={`border-l-4 ${accentClass} transition-all hover:shadow-md overflow-hidden`}>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">#{order.id.slice(0, 8)}</span>
                <Badge variant="outline" className={`${statusBadge.className} border text-[10px] font-semibold uppercase tracking-wide`}>
                  {statusBadge.label}
                </Badge>
                {order.cancellation_reason && (
                  <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 max-w-[200px] truncate"
                    style={{
                      color: reasonCfg.color === 'blue' ? '#2563eb' : reasonCfg.color === 'green' ? '#059669' : '#6b7280',
                      borderColor: reasonCfg.color === 'blue' ? 'rgba(37,99,235,0.3)' : reasonCfg.color === 'green' ? 'rgba(5,150,105,0.3)' : 'rgba(107,114,128,0.3)',
                      backgroundColor: reasonCfg.color === 'blue' ? 'rgba(37,99,235,0.1)' : reasonCfg.color === 'green' ? 'rgba(5,150,105,0.1)' : 'rgba(107,114,128,0.1)',
                    }}>
                    {reasonCfg.label}
                    {order.cancellation_reason !== 'prazo_expirado' && order.cancellation_reason !== 'cancelado_pelo_cliente' && order.cancellation_reason !== 'cancelado_admin' && order.cancellation_reason !== 'estorno_total' && (
                      <> — "{order.cancellation_reason}"</>
                    )}
                  </Badge>
                )}
              </div>
              <p className="font-semibold text-base mt-1 truncate">{customerName}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(order.created_at).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
              <p className="text-xs text-muted-foreground">{customerCpf}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold text-primary leading-tight">
                R$ {order.total_amount.toFixed(2)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {order.order_items.length} {order.order_items.length === 1 ? 'item' : 'itens'}
              </p>
            </div>
          </div>

          <div className="mt-3 p-3 bg-muted/50 rounded-lg border">
            {hasPayment ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">{methodName}{cardDetail}{cardLastDigits} · {gwName}</span>
                  {gatewayUrl && (
                    <div className="flex items-center gap-2">
                      <a
                        href={gatewayUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Abrir no {gwName} <ExternalLink className="w-3 h-3" />
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                        disabled={verifyingGateway}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setVerifyingGateway(true);
                          try {
                            const { data, error } = await supabase.functions.invoke('verify-payment', {
                              body: { orderId: order.id },
                            });
                            if (error || !data) {
                              toast({ title: 'Erro ao verificar', description: error?.message || 'Falha na consulta', variant: 'destructive' });
                            } else {
                              const statusMap: Record<string, string> = {
                                pending: 'Pendente',
                                approved: 'Aprovado',
                                expired: 'Expirado',
                                cancelled: 'Cancelado',
                                rejected: 'Recusado',
                                refunded: 'Estornado',
                              };
                              const gwStatus = statusMap[data.status] || data.status || 'Desconhecido';
                              toast({
                                title: `${gwName}: ${gwStatus}`,
                                description: data.message || `Status retornado pelo gateway: ${data.status}`,
                                variant: data.status === 'approved' ? 'default' : 'destructive',
                              });
                            }
                          } catch {
                            toast({ title: 'Erro', description: 'Falha ao consultar gateway', variant: 'destructive' });
                          } finally {
                            setVerifyingGateway(false);
                          }
                        }}
                      >
                        {verifyingGateway ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Verificar status
                      </Button>
                    </div>
                  )}
                </div>
                {(order.payment_id || order.asaas_payment_id) && (
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    ID: {(order.payment_id || order.asaas_payment_id)!.slice(0, 12)}{(order.payment_id || order.asaas_payment_id)!.length > 12 ? '...' : ''}
                  </p>
                )}
                <div className="flex items-center gap-2 text-sm pt-1 border-t">
                  <span>{statusIcon}</span>
                  <span className={category === 'needs_refund' ? 'text-amber-600 dark:text-amber-400 font-medium' : category === 'refunded' ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-muted-foreground'}>
                    {statusText}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-muted-foreground">{statusIcon}</span>
                  <span className="text-muted-foreground">{statusText}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pedido cancelado antes da geração do pagamento. Estorno não se aplica.
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'}
              </Button>
            </CollapsibleTrigger>

            {category === 'needs_refund' && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    disabled={isRefunding}
                    className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                  >
                    {isRefunding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                    {isRefunding ? 'Estornando...' : 'Estornar dinheiro'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Estornar pagamento ao cliente</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div>
                        O valor será devolvido ao cliente diretamente pelo <strong>{gwName}</strong>. Para PIX o estorno é imediato. Para cartão, aparece na próxima fatura (1–2 ciclos).
                        <div className="mt-3 p-3 bg-muted rounded-md text-sm space-y-1">
                          <div><strong>Pedido:</strong> #{order.id.slice(0, 8)}</div>
                          <div><strong>Cliente:</strong> {customerName}</div>
                          <div><strong>Método:</strong> {methodName}{cardDetail}{cardLastDigits}</div>
                          <div><strong>Total do pedido:</strong> R$ {total.toFixed(2)}</div>
                          {refunded > 0 && (
                            <div><strong>Já estornado:</strong> R$ {refunded.toFixed(2)}</div>
                          )}
                          <div className="text-emerald-700 dark:text-emerald-400">
                            <strong>A estornar agora:</strong> R$ {(total - refunded).toFixed(2)}
                          </div>
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground">
                          Esta ação não pode ser desfeita.
                        </div>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onRefund(order.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Confirmar estorno
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {category === 'refunded' && gatewayUrl && (
              <Button size="sm" variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10" asChild>
                <a href={gatewayUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Comprovante no {gwName}
                </a>
              </Button>
            )}
          </div>
        </div>

        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 space-y-4 bg-muted/30 border-t">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              <div>
                <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Itens do Pedido</h4>
                <div className="space-y-1.5">
                  {order.order_items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-2.5 bg-background rounded-lg border text-sm">
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-medium truncate">{item.products.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} × R$ {item.price_at_purchase.toFixed(2)}
                        </p>
                      </div>
                      <p className="font-semibold text-sm shrink-0">
                        R$ {(item.quantity * item.price_at_purchase).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Resumo</h4>
                <div className="bg-background rounded-lg border p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>R$ {(order.total_amount - order.shipping_cost).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Frete</span>
                    <span>R$ {order.shipping_cost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold pt-2 border-t mt-1">
                    <span>Total</span>
                    <span className="text-primary">R$ {order.total_amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {refunded > 0 && (
              <div className="bg-background rounded-lg border p-3">
                <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                  Histórico de estornos
                </h4>
                {isLoadingHistory ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Carregando...
                  </div>
                ) : refundHistoryRecords && refundHistoryRecords.length > 0 ? (
                  <div className="space-y-2">
                    {refundHistoryRecords.map((r: any) => (
                      <div key={r.id} className="flex items-start justify-between p-2.5 bg-muted/50 rounded-lg text-sm">
                        <div>
                          <p className="font-medium">
                            R$ {Number(r.amount).toFixed(2)}
                            <Badge variant="outline" className={`ml-2 text-[10px] ${
                              r.status === 'approved' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' :
                              r.status === 'pending' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' :
                              'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
                            }`}>
                              {r.status === 'approved' ? 'Aprovado' : r.status === 'pending' ? 'Pendente' : r.status}
                            </Badge>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            {' · '}{r.gateway === 'asaas' ? 'Asaas' : r.gateway === 'mercadopago' ? 'Mercado Pago' : r.gateway || 'Gateway'}
                            {r.gateway_refund_id && (
                              <> · <span className="font-mono">{r.gateway_refund_id.slice(0, 12)}...</span></>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {order.nfe_emissions && order.nfe_emissions.length > 0 && (
              <div className="bg-background rounded-lg border p-3">
                <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3">Nota Fiscal Eletrônica</h4>
                {order.nfe_emissions.map((nfe) => (
                  <div key={nfe.id} className="space-y-2">
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase">Número</p>
                        <p className="font-mono font-semibold">{nfe.nfe_number || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase">Status</p>
                        <Badge variant={nfe.status === 'success' ? 'default' : nfe.status === 'pending' ? 'secondary' : 'destructive'} className="mt-0.5">
                          {nfe.status === 'success' ? 'Emitida' : nfe.status === 'pending' ? 'Pendente' : 'Erro'}
                        </Badge>
                      </div>
                    </div>
                    {nfe.status === 'success' && nfe.nfe_xml_url && (
                      <Button size="sm" variant="outline" onClick={() => window.open(nfe.nfe_xml_url!, '_blank')} className="w-full">
                        Download XML
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function CancelledOrdersView({
  orders,
  profiles,
  expandedOrders,
  toggleOrderExpansion,
  refundPayment,
  refundingOrders,
  loadOrders,
}: {
  orders: Order[];
  profiles: Record<string, { name: string; cpf: string }>;
  expandedOrders: Set<string>;
  toggleOrderExpansion: (orderId: string) => void;
  refundPayment: (orderId: string) => Promise<boolean>;
  refundingOrders: Set<string>;
  loadOrders: () => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [refundHistory, setRefundHistory] = useState<Record<string, any[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<Set<string>>(new Set());

  const needsRefund = orders.filter(o => classifyCancelledOrder(o) === 'needs_refund');
  const noPayment = orders.filter(o => classifyCancelledOrder(o) === 'no_payment');
  const refunded = orders.filter(o => classifyCancelledOrder(o) === 'refunded');

  const displayedOrders = useMemo(() => {
    if (categoryFilter === 'all') return orders;
    if (categoryFilter === 'needs_refund') return needsRefund;
    if (categoryFilter === 'no_payment') return noPayment;
    if (categoryFilter === 'refunded') return refunded;
    return orders;
  }, [categoryFilter, orders, needsRefund, noPayment, refunded]);

  const handleRefund = async (orderId: string) => {
    await refundPayment(orderId);
  };

  const handleToggleExpand = async (orderId: string) => {
    toggleOrderExpansion(orderId);
    if (!expandedOrders.has(orderId) && !refundHistory[orderId]) {
      const order = orders.find(o => o.id === orderId);
      if (order && (order.refunded_amount ?? 0) > 0) {
        setLoadingHistory(prev => new Set(prev).add(orderId));
        const { data } = await supabase
          .from('payment_refunds')
          .select('id, amount, status, gateway, gateway_refund_id, created_at')
          .eq('order_id', orderId)
          .neq('status', 'rejected')
          .order('created_at', { ascending: false });
        if (data) {
          setRefundHistory(prev => ({ ...prev, [orderId]: data }));
        }
        setLoadingHistory(prev => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      }
    }
  };

  const filterOptions = [
    { value: 'all', label: 'Todos', count: orders.length },
    { value: 'needs_refund', label: 'Precisa de estorno', count: needsRefund.length },
    { value: 'no_payment', label: 'Sem pagamento', count: noPayment.length },
    { value: 'refunded', label: 'Reembolsado', count: refunded.length },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-muted-foreground">Filtrar:</span>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {filterOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label} ({opt.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {displayedOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-xl border border-dashed bg-muted/30">
          <Package className="w-12 h-12 mb-3 opacity-40" />
          <p className="text-sm font-medium">Nenhum pedido nesta categoria</p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayedOrders.map(order => (
            <CancelledOrderCard
              key={order.id}
              order={order}
              customerName={profiles[order.user_id]?.name || 'Carregando...'}
              customerCpf={profiles[order.user_id]?.cpf || 'N/A'}
              isExpanded={expandedOrders.has(order.id)}
              onToggleExpand={() => handleToggleExpand(order.id)}
              onRefund={handleRefund}
              isRefunding={refundingOrders.has(order.id)}
              refundHistoryRecords={refundHistory[order.id]}
              isLoadingHistory={loadingHistory.has(order.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SiteTabs({
  site,
  profiles,
  loadOrders,
  cancelOrder,
  cancellingOrders,
  flow,
  setFlow,
  hasPendingRetirada,
  hasPendingEntrega,
  tableProps,
  setLabelOrder,
  expandedOrders,
  toggleOrderExpansion,
  refundPayment,
  refundingOrders,
}: {
  site: Record<string, Order[]>;
  profiles: Record<string, { name: string; cpf: string }>;
  loadOrders: () => void;
  cancelOrder: (orderId: string, reason: string) => Promise<void>;
  cancellingOrders: Set<string>;
  flow: 'retirada' | 'entrega';
  setFlow: (f: 'retirada' | 'entrega') => void;
  hasPendingRetirada: boolean;
  hasPendingEntrega: boolean;
  tableProps: any;
  setLabelOrder: (o: Order) => void;
  expandedOrders: Set<string>;
  toggleOrderExpansion: (orderId: string) => void;
  refundPayment: (orderId: string) => Promise<boolean>;
  refundingOrders: Set<string>;
}) {
  const sharedTabs = {
    semPagamento: (
      <TabsTrigger key="sem-pagamento" value="sem-pagamento" className="shrink-0">
        <Clock className="w-4 h-4 mr-2" />
        Sem Pagamento
        {site.semPagamento.length > 0 && (
          <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.semPagamento.length}</Badge>
        )}
      </TabsTrigger>
    ),
    devolucoes: (
      <TabsTrigger
        key="devolucoes"
        value="devolucoes"
        className="shrink-0 data-[state=active]:bg-red-500/15 data-[state=active]:text-red-600 dark:data-[state=active]:text-red-400"
      >
        <Undo2 className="w-4 h-4 mr-2" />
        Devoluções
        {site.devolucoes.length > 0 && (
          <Badge className="ml-2 h-5 min-w-5 px-1 bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30">
            {site.devolucoes.length}
          </Badge>
        )}
      </TabsTrigger>
    ),
    cancelados: (
      <TabsTrigger
        key="cancelados"
        value="cancelados"
        className="shrink-0 data-[state=active]:bg-red-500/15 data-[state=active]:text-red-600 dark:data-[state=active]:text-red-400"
      >
        <XCircle className="w-4 h-4 mr-2" />
        Cancelados
        {site.cancelados.length > 0 && (
          <Badge className="ml-2 h-5 min-w-5 px-1 bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30">
            {site.cancelados.length}
          </Badge>
        )}
      </TabsTrigger>
    ),
  };

  return (
    <div className="space-y-4 w-full">
      <div className="inline-flex rounded-lg bg-muted p-1">
        <button
          onClick={() => setFlow('retirada')}
          className={`relative inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-all ${
            flow === 'retirada'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Store className="w-4 h-4" />
          Retirada
          {hasPendingRetirada && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full ring-2 ring-background" />
          )}
        </button>
        <button
          onClick={() => setFlow('entrega')}
          className={`relative inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-all ${
            flow === 'entrega'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Truck className="w-4 h-4" />
          Entrega
          {hasPendingEntrega && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full ring-2 ring-background" />
          )}
        </button>
      </div>

      {/* Fluxo Retirada */}
      {flow === 'retirada' && (
        <Tabs defaultValue="sem-pagamento">
          <div className="-mx-3 md:mx-0 px-3 md:px-0 overflow-x-auto">
            <TabsList className="inline-flex flex-nowrap w-full gap-1 [&>*]:flex-1">
              {sharedTabs.semPagamento}
              <TabsTrigger key="em-preparacao" value="em-preparacao" className="shrink-0">
                <Package className="w-4 h-4 mr-2" />
                Em Preparação
                {site.emPreparacaoPickup.length > 0 && (
                  <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.emPreparacaoPickup.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="pronto-retirar" className="shrink-0">
                <Store className="w-4 h-4 mr-2" />
                Retirada
                {site.prontoRetirar.length > 0 && (
                  <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.prontoRetirar.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="retirados" className="shrink-0">
                <CheckCircle className="w-4 h-4 mr-2" />
                Retirados
                {site.retirados.length > 0 && (
                  <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.retirados.length}</Badge>
                )}
              </TabsTrigger>
              {sharedTabs.devolucoes}
              {sharedTabs.cancelados}
            </TabsList>
          </div>

          <TabsContent value="sem-pagamento"><OrdersTable orders={site.semPagamento} {...tableProps} /></TabsContent>
          <TabsContent value="em-preparacao">
            <TriagemSection
              orders={site.emPreparacaoPickup}
              profiles={profiles}
              onStatusChanged={loadOrders}
              openLabelDialog={(o: Order) => setLabelOrder(o)}
              cancelOrder={cancelOrder}
              cancellingOrders={cancellingOrders}
            />
          </TabsContent>
          <TabsContent value="pronto-retirar"><OrdersTable orders={site.prontoRetirar} {...tableProps} /></TabsContent>
          <TabsContent value="retirados"><OrdersTable orders={site.retirados} {...tableProps} /></TabsContent>
          <TabsContent value="devolucoes"><OrdersTable orders={site.devolucoes} {...tableProps} /></TabsContent>
          <TabsContent value="cancelados">
            <CancelledOrdersView
              orders={site.cancelados}
              profiles={profiles}
              expandedOrders={expandedOrders}
              toggleOrderExpansion={toggleOrderExpansion}
              refundPayment={refundPayment}
              refundingOrders={refundingOrders}
              loadOrders={loadOrders}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Fluxo Entrega */}
      {flow === 'entrega' && (
        <Tabs defaultValue="sem-pagamento">
          <div className="-mx-3 md:mx-0 px-3 md:px-0 overflow-x-auto">
            <TabsList className="inline-flex flex-nowrap w-full gap-1 [&>*]:flex-1">
              {sharedTabs.semPagamento}
              <TabsTrigger key="em-preparacao" value="em-preparacao" className="shrink-0">
                <Package className="w-4 h-4 mr-2" />
                Em Preparação
                {site.emPreparacaoDelivery.length > 0 && (
                  <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.emPreparacaoDelivery.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="aguardando-envio" className="shrink-0">
                <PackageCheck className="w-4 h-4 mr-2" />
                Envio
                {site.aguardandoEnvio.length > 0 && (
                  <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.aguardandoEnvio.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="em-caminho" className="shrink-0">
                <Truck className="w-4 h-4 mr-2" />
                Em Transporte
                {site.emCaminho.length > 0 && (
                  <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.emCaminho.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="entregues" className="shrink-0">
                <CheckCircle className="w-4 h-4 mr-2" />
                Entregues
                {site.entregues.length > 0 && (
                  <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.entregues.length}</Badge>
                )}
              </TabsTrigger>
              {sharedTabs.devolucoes}
              {sharedTabs.cancelados}
            </TabsList>
          </div>

          <TabsContent value="sem-pagamento"><OrdersTable orders={site.semPagamento} {...tableProps} /></TabsContent>
          <TabsContent value="em-preparacao">
            <TriagemSection
              orders={site.emPreparacaoDelivery}
              profiles={profiles}
              onStatusChanged={loadOrders}
              openLabelDialog={(o: Order) => setLabelOrder(o)}
              cancelOrder={cancelOrder}
              cancellingOrders={cancellingOrders}
            />
          </TabsContent>
          <TabsContent value="aguardando-envio"><OrdersTable orders={site.aguardandoEnvio} {...tableProps} /></TabsContent>
          <TabsContent value="em-caminho"><OrdersTable orders={site.emCaminho} {...tableProps} /></TabsContent>
          <TabsContent value="entregues"><OrdersTable orders={site.entregues} {...tableProps} /></TabsContent>
          <TabsContent value="devolucoes"><OrdersTable orders={site.devolucoes} {...tableProps} /></TabsContent>
          <TabsContent value="cancelados">
            <CancelledOrdersView
              orders={site.cancelados}
              profiles={profiles}
              expandedOrders={expandedOrders}
              toggleOrderExpansion={toggleOrderExpansion}
              refundPayment={refundPayment}
              refundingOrders={refundingOrders}
              loadOrders={loadOrders}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export function OrdersManagement() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; cpf: string }>>({});
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [trackingCodes, setTrackingCodes] = useState<Record<string, string>>({});
  const [emittingNFCe, setEmittingNFCe] = useState<Set<string>>(new Set());
  const [labelOrder, setLabelOrder] = useState<Order | null>(null);
  const [refundingOrders, setRefundingOrders] = useState<Set<string>>(new Set());
  const [cancellingOrders, setCancellingOrders] = useState<Set<string>>(new Set());
  const [flow, setFlow] = useState<'retirada' | 'entrega'>('retirada');
  const { toast } = useToast();

  const toggleOrderExpansion = (orderId: string) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    loadOrders();

    // Debounce reloads para evitar tempestade de requisições quando muitos pedidos mudam
    let reloadTimeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimeout) clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(() => loadOrders(), 800);
    };

    // Configurar realtime para atualizar automaticamente quando pedidos mudarem
    const channel = supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Escutar INSERT, UPDATE e DELETE
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          console.log('Order change detected:', payload);
          scheduleReload();
        }
      )
      .subscribe();

    return () => {
      if (reloadTimeout) clearTimeout(reloadTimeout);
      supabase.removeChannel(channel);
    };
  }, []);

  const loadOrders = async (retryCount = 0) => {
    try {
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            products (name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(300);

      if (ordersError) throw ordersError;

      // Buscar NF-e emissions separadamente (evita join pesado que estoura timeout)
      const orderIdsForNfe = (ordersData ?? []).map((o: any) => o.id);
      const nfeMap: Record<string, any[]> = {};
      if (orderIdsForNfe.length > 0) {
        const { data: nfeData } = await supabase
          .from('nfe_emissions')
          .select('id, order_id, nfe_number, nfe_key, nfe_xml_url, danfe_url, status, emitted_at, error_message')
          .in('order_id', orderIdsForNfe);
        (nfeData ?? []).forEach((n: any) => {
          (nfeMap[n.order_id] = nfeMap[n.order_id] || []).push(n);
        });
      }
      (ordersData ?? []).forEach((o: any) => {
        o.nfe_emissions = nfeMap[o.id] || [];
      });

      // Buscar perfis dos usuários
      const userIds = [...new Set(ordersData?.map(o => o.user_id) || [])];
      let profilesData: Array<{ id: string; full_name: string | null; cpf: string | null }> | null = null;

      if (userIds.length > 0) {
        const { data, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, cpf')
          .in('id', userIds);

        if (profilesError) {
          console.warn('Falha ao carregar perfis (mantendo pedidos visíveis):', profilesError);
        } else {
          profilesData = data;
        }
      }

      // Audit log agregado (1 chamada apenas, em background) — não bloqueia UI nem dispara N requests
      if (profilesData && profilesData.length > 0) {
        supabase.rpc('log_admin_access', {
          p_action: 'VIEW_PROFILES_BULK',
          p_table_name: 'profiles',
          p_details: {
            context: 'orders_management',
            timestamp: new Date().toISOString(),
            profile_count: profilesData.length,
            accessed_user_ids: profilesData.map(p => p.id),
          },
        }).then(({ error }) => {
          if (error) console.warn('Falha ao registrar audit log (não bloqueante):', error);
        });
      }

      const profilesMap: Record<string, { name: string; cpf: string }> = {};
      profilesData?.forEach(p => {
        profilesMap[p.id] = {
          name: p.full_name || 'Sem nome',
          cpf: p.cpf || 'Não informado'
        };
      });

      // refunded_amount vem exclusivamente do payment_refunds (fonte primária).
      // orders.refunded_amount é um cache mantido pelas edge functions — pode
      // desincronizar (ex: estorno manual via dashboard Asaas sem webhook).
      // Contamos approved + pending, ignorando apenas rejected.
      const orderIds = (ordersData ?? []).map(o => o.id);
      const refundedMap: Record<string, number> = {};
      if (orderIds.length > 0) {
        const { data: refundsData } = await supabase
          .from('payment_refunds')
          .select('order_id, amount, status')
          .in('order_id', orderIds)
          .neq('status', 'rejected');
        (refundsData ?? []).forEach((r: any) => {
          refundedMap[r.order_id] = (refundedMap[r.order_id] ?? 0) + Number(r.amount);
        });
      }

      const ordersWithRefunds = (ordersData ?? []).map((o: any) => ({
        ...o,
        refunded_amount: refundedMap[o.id] ?? 0,
      }));

      setProfiles(profilesMap);
      setOrders(ordersWithRefunds as Order[]);
      setLoading(false);
    } catch (err: any) {
      console.error('Erro ao carregar pedidos:', err);

      // Retry automático com backoff (até 3 tentativas) — falhas de rede transitórias
      if (retryCount < 3) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
        console.log(`Tentando novamente em ${delay}ms (tentativa ${retryCount + 1}/3)...`);
        setTimeout(() => loadOrders(retryCount + 1), delay);
        return;
      }

      // Após esgotar retries, mostrar toast mas NÃO limpar pedidos já carregados
      toast({
        title: 'Erro ao carregar pedidos',
        description: err?.message || 'Falha de conexão. Mantendo última lista carregada.',
        variant: 'destructive'
      });
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: Order['status'], extra?: Record<string, any>) => {
    const currentOrder = orders.find(o => o.id === orderId);
    if (currentOrder && currentOrder.status === 'aguardando_pagamento' && newStatus === 'em_preparo') {
      toast({
        title: 'Pagamento não verificado',
        description: 'Use "Verificar Pagamento" para confirmar o pagamento antes de avançar o status.',
        variant: 'destructive'
      });
      return;
    }

    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus as any, ...(extra || {}) })
      .eq('id', orderId);


    if (error) {
      toast({
        title: 'Erro ao atualizar status',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Status atualizado',
        description: 'O status do pedido foi atualizado com sucesso.'
      });
      
      // Emitir NF-e automaticamente se configurado
      if (newStatus === 'em_preparo') {
        try {
          const { data: settings } = await supabase
            .from('fiscal_settings')
            .select('auto_emit_nfe, nfe_enabled')
            .limit(1)
            .maybeSingle();

          if (settings?.auto_emit_nfe && settings?.nfe_enabled) {
            const { error: nfeError } = await supabase.functions.invoke('emit-nfe', {
              body: { orderId }
            });

            if (nfeError) {
              console.error('Erro ao emitir NF-e:', nfeError);
              toast({
                title: 'Aviso',
                description: 'Pedido atualizado, mas houve erro ao emitir NF-e automaticamente.',
                variant: 'destructive'
              });
            } else {
              toast({
                title: 'NF-e emitida',
                description: 'NF-e foi emitida automaticamente.'
              });
            }
          }
        } catch (err) {
          console.error('Erro ao verificar emissão de NF-e:', err);
        }
      }

      // Emitir NF-e automaticamente ao marcar como retirado (triagem)
      if (newStatus === 'retirado') {
        try {
          const { data: settings } = await supabase
            .from('focus_nfe_settings')
            .select('enabled, auto_emit_nfe_triagem')
            .limit(1)
            .maybeSingle();

          if (settings?.enabled && settings?.auto_emit_nfe_triagem) {
            const { data: nfe } = await supabase
              .from('nfe_emissions')
              .select('status')
              .eq('order_id', orderId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!nfe || (nfe.status !== 'autorizada' && nfe.status !== 'authorized')) {
              const { error: nfeError } = await supabase.functions.invoke('emit-nfe', {
                body: { orderId }
              });
              if (nfeError) {
                console.error('[OrdersMgmt] auto-emit NF-e error:', nfeError);
                toast({
                  title: 'Aviso',
                  description: 'Pedido atualizado, mas houve erro ao emitir NF-e automaticamente.',
                  variant: 'destructive'
                });
              } else {
                toast({
                  title: 'NF-e emitida',
                  description: 'NF-e foi emitida automaticamente.'
                });
              }
            }
          }
        } catch (err) {
          console.error('[OrdersMgmt] auto-emit NF-e error:', err);
        }
      }
      
      loadOrders();
    }
  }; 

  const updateTrackingCode = async (orderId: string) => {
    const code = trackingCodes[orderId];
    if (!code || code.trim() === '') return;

    const { error } = await supabase
      .from('orders')
      .update({ tracking_code: code.trim() })
      .eq('id', orderId);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar o código de rastreio',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Código salvo',
        description: 'Código de rastreio salvo com sucesso'
      });
      loadOrders();
      // Limpar o campo após salvar
      setTrackingCodes(prev => {
        const newCodes = { ...prev };
        delete newCodes[orderId];
        return newCodes;
      });
    }
  };

  const paymentStatusMessage = (status: string): string => {
    switch (status) {
      case 'pending': return 'Pagamento ainda não foi confirmado. Aguarde o processamento.';
      case 'expired': return 'Pagamento expirado. O prazo do PIX ou boleto venceu.';
      case 'cancelled': return 'Pagamento cancelado.';
      case 'rejected': return 'Pagamento recusado pelo banco ou sistema antifraude.';
      case 'refunded': return 'Pagamento já foi estornado.';
      case 'approved': return 'Pagamento aprovado.';
      default: return `Status do pagamento: ${status}`;
    }
  };

  const verifyPayment = async (orderId: string) => {
    toast({
      title: 'Verificando pagamento...',
      description: 'Consultando gateway de pagamento'
    });

    try {
      const { data, error } = await supabase.functions.invoke('verify-payment', {
        body: { orderId }
      });

      if (error) {
        const ctx: any = (error as any).context;
        let serverMsg = '';
        try {
          if (ctx && typeof ctx.json === 'function') {
            const j = await ctx.json();
            serverMsg = j?.error || '';
          }
        } catch {}
        throw new Error(serverMsg || 'Não foi possível verificar o pagamento. Tente novamente.');
      }

      if (data.updated) {
        toast({
          title: 'Pagamento confirmado!',
          description: data.message,
        });
        
        // Emitir NF-e automaticamente se configurado
        try {
          const { data: settings } = await supabase
            .from('fiscal_settings')
            .select('auto_emit_nfe, nfe_enabled')
            .limit(1)
            .maybeSingle();

          if (settings?.auto_emit_nfe && settings?.nfe_enabled) {
            const { error: nfeError } = await supabase.functions.invoke('emit-nfe', {
              body: { orderId }
            });

            if (!nfeError) {
              toast({
                title: 'NF-e emitida',
                description: 'NF-e foi emitida automaticamente após confirmação do pagamento.'
              });
            }
          }
        } catch (err) {
          console.error('Erro ao verificar emissão de NF-e:', err);
        }
        
        loadOrders();
      } else {
        toast({
          title: 'Status do pagamento',
          description: paymentStatusMessage(data.status),
          variant: data.status === 'approved' ? 'default' : 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Erro ao verificar pagamento',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive'
      });
    }
  };


  const refundPayment = async (orderId: string): Promise<boolean> => {
    setRefundingOrders(prev => new Set(prev).add(orderId));
    toast({
      title: 'Estornando pagamento...',
      description: 'Solicitando estorno. Aguarde.',
    });

    try {
      const { data, error } = await supabase.functions.invoke('refund-payment', {
        body: { orderId },
      });

      if (error) {
        const ctx: any = (error as any).context;
        let serverMsg = '';
        try {
          if (ctx && typeof ctx.json === 'function') {
            const j = await ctx.json();
            serverMsg = j?.error || j?.details || '';
          }
        } catch {}
        throw new Error(serverMsg || error.message);
      }

      if (data?.success) {
        toast({
          title: data.status === 'approved' ? 'Estorno aprovado!' : 'Estorno em processamento',
          description: data.status === 'approved'
            ? `R$ ${Number(data.amount).toFixed(2)} foi devolvido ao cliente.`
            : 'O gateway confirmará em breve. O cliente receberá o valor automaticamente.',
        });
        await loadOrders();
        return true;
      } else {
        throw new Error(data?.error || 'Falha desconhecida ao estornar');
      }
    } catch (err: any) {
      const { data: checkData } = await supabase.functions.invoke('check-order-refund', {
        body: { orderId },
      });

      if (checkData?.found && checkData.totalApproved > 0) {
        toast({
          title: 'Estorno já registrado',
          description: `R$ ${checkData.totalApproved.toFixed(2)} já foi estornado via ${checkData.refunds?.[0]?.gatewayRefundId?.slice(0, 8) ?? 'gateway'}.`,
        });
        loadOrders();
        return true;
      } else {
        toast({
          title: 'Erro ao estornar',
          description: err?.message || 'Não foi possível processar o estorno.',
          variant: 'destructive',
        });
      }
      return false;
    } finally {
      setRefundingOrders(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const cancelOrder = async (orderId: string, reason: string): Promise<void> => {
    setCancellingOrders(prev => new Set(prev).add(orderId));

    try {
      const { data, error } = await supabase.functions.invoke('cancel-order', {
        body: { orderId, cancellation_reason: reason },
      });

      if (error) {
        const ctx: any = (error as any).context;
        let serverMsg = '';
        try {
          if (ctx && typeof ctx.json === 'function') {
            const j = await ctx.json();
            serverMsg = j?.error || '';
          }
        } catch {}
        throw new Error(serverMsg || 'Não foi possível cancelar o pedido. Tente novamente.');
      }

      toast({
        title: data.refunded ? 'Pedido cancelado e estornado' : 'Pedido cancelado',
        description: data.message,
        variant: data.error ? 'destructive' : 'default',
      });

      loadOrders();
    } catch (err: any) {
      const message = err?.message || 'Não foi possível cancelar o pedido.';
      throw new Error(message);
    } finally {
      setCancellingOrders(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const emitNFCe = async (orderId: string) => {
    setEmittingNFCe(prev => new Set(prev).add(orderId));
    toast({
      title: 'Emitindo NFC-e...',
      description: 'Enviando dados para a SEFAZ. Isso pode levar alguns segundos.',
    });

    try {
      // Buscar itens completos do pedido (com dados fiscais dos produtos)
      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('quantity, price_at_purchase, product_id, products(name, ncm, cfop, csosn, origem, unidade_comercial, cest)')
        .eq('order_id', orderId);

      if (itemsError) throw itemsError;
      if (!items || items.length === 0) throw new Error('Pedido sem itens');

      // Buscar pedido para pegar customer e total
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('total_amount, customer_id, customers(full_name, cpf, cnpj, company_name)')
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;

      const cust = order.customers as any;
      const payload = {
        order_id: orderId,
        payment_method: 'dinheiro' as const,
        total_amount: Number(order.total_amount),
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

      const { data, error } = await supabase.functions.invoke('emit-nfce', {
        body: payload
      });

      if (error) {
        let errorMessage: string | null = null;
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.clone === 'function' && typeof ctx.json === 'function') {
            const parsed = await ctx.clone().json().catch(() => null);
            errorMessage = parsed?.error || parsed?.message || null;
            if (!errorMessage) {
              const txt = await ctx.clone().text().catch(() => null);
              if (txt) errorMessage = txt;
            }
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(errorMessage || error.message || 'Falha ao emitir NFC-e');
      }
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'NFC-e emitida com sucesso! ✅',
        description: data?.nfe_number ? `Número: ${data.nfe_number}` : 'A nota fiscal foi gerada.',
      });
      loadOrders();
    } catch (error: any) {
      console.error('Erro ao emitir NFC-e:', error);
      toast({
        title: 'Erro ao emitir NFC-e',
        description: error.message || 'Verifique as configurações fiscais e tente novamente.',
        variant: 'destructive'
      });
    } finally {
      setEmittingNFCe(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  if (loading) {
    return <div>Carregando pedidos...</div>;
  }

  // Apenas pedidos vindos do site (PDV é gerido em outra área)
  const siteOrders = orders.filter(o => ((o as any).source ?? 'site') === 'site');

  const site = {
    semPagamento: siteOrders.filter(o => o.status === 'aguardando_pagamento'),
    emPreparacao: siteOrders.filter(o => o.status === 'em_preparo'),
    emPreparacaoDelivery: siteOrders.filter(o => o.status === 'em_preparo' && o.delivery_type !== 'pickup'),
    emPreparacaoPickup: siteOrders.filter(o => o.status === 'em_preparo' && o.delivery_type === 'pickup'),
    aguardandoEnvio: siteOrders.filter(o => o.status === 'aguardando_envio' && o.delivery_type !== 'pickup'),
    prontoRetirar: siteOrders.filter(o => o.status === 'pronto_retirada' && o.delivery_type === 'pickup'),
    emCaminho: siteOrders.filter(o => o.status === 'enviado'),
    entregues: siteOrders.filter(o => o.status === 'entregado'),
    retirados: siteOrders.filter(o => o.status === 'retirado'),
    devolucoes: siteOrders.filter(o => o.status === 'devolvido' || o.status === 'devolucao_solicitada'),
    cancelados: siteOrders.filter(o => o.status === 'cancelado'),
  };

  const tableProps = {
    profiles,
    expandedOrders,
    toggleOrderExpansion,
    updateOrderStatus,
    verifyPayment,
    trackingCodes,
    setTrackingCodes,
    updateTrackingCode,
    emitNFCe,
    emittingNFCe,
    refundPayment,
    refundingOrders,
    cancellingOrders,
    cancelOrder,
  };

  const hasPendingRetirada = site.prontoRetirar.length > 0;
  const hasPendingEntrega = site.aguardandoEnvio.length > 0;


  const totalRevenue = orders
    .filter(o => o.status !== 'aguardando_pagamento')
    .reduce((sum, o) => sum + Number(o.total_amount), 0);
  const pendingCount = orders.filter(o => o.status === 'aguardando_pagamento').length;

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      {/* Header com gradient */}
      <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-b">
        <div className="p-3 md:p-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Package className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg md:text-2xl font-bold tracking-tight leading-tight">Gestão de Pedidos do Site</h2>
                <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 md:line-clamp-none">
                  Acompanhe os pedidos da loja online organizados por status
                </p>
              </div>
            </div>
          </div>
          <div className="-mx-3 md:mx-0 px-3 md:px-0 overflow-x-auto md:overflow-visible scrollbar-hide">
            <div className="flex gap-2 md:gap-3 min-w-min">
              <div className="shrink-0 px-3 py-1.5 md:px-4 md:py-2 rounded-lg bg-background/80 backdrop-blur border min-w-[88px] md:min-w-[110px]">
                <p className="text-[9px] md:text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Total</p>
                <p className="text-base md:text-xl font-bold">{orders.length}</p>
              </div>
              <div className="shrink-0 px-3 py-1.5 md:px-4 md:py-2 rounded-lg bg-background/80 backdrop-blur border min-w-[88px] md:min-w-[110px]">
                <p className="text-[9px] md:text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Pendentes</p>
                <p className="text-base md:text-xl font-bold text-orange-500">{pendingCount}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CardContent className="p-3 md:p-6">
        <SiteTabs
          site={site}
          profiles={profiles}
          loadOrders={loadOrders}
          cancelOrder={cancelOrder}
          cancellingOrders={cancellingOrders}
          flow={flow}
          setFlow={setFlow}
          hasPendingRetirada={hasPendingRetirada}
          hasPendingEntrega={hasPendingEntrega}
          tableProps={tableProps}
          setLabelOrder={(o: Order) => setLabelOrder(o)}
          expandedOrders={expandedOrders}
          toggleOrderExpansion={toggleOrderExpansion}
          refundPayment={refundPayment}
          refundingOrders={refundingOrders}
        />
      </CardContent>

      <MelhorEnvioLabelDialog
        open={!!labelOrder}
        onOpenChange={(o) => { if (!o) setLabelOrder(null); }}
        order={labelOrder}
        onSuccess={loadOrders}
      />
    </Card>
  );
}
