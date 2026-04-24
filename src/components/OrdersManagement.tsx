import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Package, Truck, CheckCircle, Trash2, ChevronDown, ChevronRight, Clock, PackageCheck, Store, RefreshCw, Receipt, Loader2, Search, Calendar as CalendarIcon, X } from 'lucide-react';
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
  status: 'aguardando_pagamento' | 'em_preparo' | 'enviado' | 'entregado' | 'retirado' | 'cancelado';
  created_at: string;
  user_id: string;
  shipping_cep: string;
  delivery_type: 'delivery' | 'pickup';
  source?: 'site' | 'pdv';
  tracking_code?: string;
  order_items: OrderItem[];
  nfe_emissions?: NFEEmission[];
}

interface Profile {
  full_name: string;
  cpf: string | null;
}

const statusConfig = {
  aguardando_pagamento: {
    label: 'Aguardando Pagamento',
    icon: Clock,
    badgeClass: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/20',
    accentClass: 'border-l-orange-500',
  },
  em_preparo: {
    label: 'Em Preparo',
    icon: Package,
    badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20',
    accentClass: 'border-l-amber-500',
  },
  enviado: {
    label: 'Enviado',
    icon: Truck,
    badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/20',
    accentClass: 'border-l-blue-500',
  },
  entregado: {
    label: 'Entregue',
    icon: CheckCircle,
    badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20',
    accentClass: 'border-l-emerald-500',
  },
  retirado: {
    label: 'Retirado',
    icon: CheckCircle,
    badgeClass: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border-emerald-600/30 hover:bg-emerald-600/20',
    accentClass: 'border-l-emerald-600',
  },
  cancelado: {
    label: 'Cancelado',
    icon: Clock,
    badgeClass: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/20',
    accentClass: 'border-l-red-500',
  },
} as const;

// Etiqueta de status considerando o tipo de entrega (retirada na loja => "Pronto para Retirar")
const getStatusLabel = (status: Order['status'], deliveryType: Order['delivery_type']): string => {
  if (status === 'em_preparo' && deliveryType === 'pickup') return 'Pronto para Retirar';
  return statusConfig[status].label;
};

const getNextStatus = (currentStatus: Order['status'], deliveryType: Order['delivery_type']): Order['status'] | null => {
  if (currentStatus === 'aguardando_pagamento') return 'em_preparo';
  if (currentStatus === 'em_preparo') {
    return deliveryType === 'pickup' ? 'retirado' : 'enviado';
  }
  if (currentStatus === 'enviado') return 'entregado';
  return null;
};

const getNextStatusLabel = (currentStatus: Order['status'], deliveryType: Order['delivery_type']): string => {
  if (currentStatus === 'aguardando_pagamento') {
    return deliveryType === 'pickup' ? 'Marcar como Pronto para Retirar' : 'Marcar como Em Preparo';
  }
  if (currentStatus === 'em_preparo') {
    return deliveryType === 'pickup' ? 'Marcar como Retirado' : 'Marcar como Enviado';
  }
  if (currentStatus === 'enviado') return 'Marcar como Entregue';
  return 'Finalizado';
};

const OrdersTable = ({ 
  orders, 
  profiles, 
  expandedOrders, 
  toggleOrderExpansion,
  updateOrderStatus,
  deleteOrder,
  verifyPayment,
  trackingCodes,
  setTrackingCodes,
  updateTrackingCode,
  emitNFCe,
  emittingNFCe,
  openLabelDialog,
}: {
  orders: Order[];
  profiles: Record<string, { name: string; cpf: string }>;
  expandedOrders: Set<string>;
  toggleOrderExpansion: (orderId: string) => void;
  updateOrderStatus: (orderId: string, newStatus: Order['status']) => void;
  deleteOrder: (orderId: string) => void;
  verifyPayment: (orderId: string) => void;
  trackingCodes: Record<string, string>;
  setTrackingCodes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  updateTrackingCode: (orderId: string) => void;
  emitNFCe: (orderId: string) => void;
  emittingNFCe: Set<string>;
  openLabelDialog: (order: Order) => void;
}) => {
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
                      <Badge variant="outline" className="text-[10px] font-medium">
                        {order.delivery_type === 'pickup' ? '🏪 Retirada' : '🚚 Entrega'}
                      </Badge>
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
                <span><span className="opacity-70">CPF:</span> <span className="font-mono">{customerCpf}</span></span>
                <span><span className="opacity-70">CEP:</span> <span className="font-mono">{order.shipping_cep || 'N/A'}</span></span>
              </div>

              {/* Ações */}
              <div className="px-4 pb-4 flex flex-wrap items-center gap-2">
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
                    {order.tracking_code ? 'Nova Etiqueta' : 'Gerar Etiqueta'}
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

                <div className="ml-auto">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="hover:bg-destructive/10 hover:text-destructive h-8 w-8">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div>
                            Tem certeza que deseja excluir este pedido? Esta ação não pode ser desfeita.
                            <div className="mt-2 p-2 bg-muted rounded-md text-sm">
                              <strong>Pedido:</strong> {order.id.slice(0, 8)}...<br />
                              <strong>Cliente:</strong> {customerName}<br />
                              <strong>Total:</strong> R$ {order.total_amount.toFixed(2)}
                            </div>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteOrder(order.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Tenho Certeza
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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

                  {/* NF-e */}
                  {order.nfe_emissions && order.nfe_emissions.length > 0 && (
                    <div className="bg-background rounded-lg border p-3">
                      <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                        📄 Nota Fiscal Eletrônica
                      </h4>
                      {order.nfe_emissions.map((nfe) => (
                        <div key={nfe.id} className="space-y-2">
                          <div className="grid grid-cols-3 gap-3 text-sm">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Número</p>
                              <p className="font-mono font-semibold">{nfe.nfe_number || 'N/A'}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] text-muted-foreground uppercase">Chave</p>
                              <p className="font-mono text-xs truncate">{nfe.nfe_key || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Status</p>
                              <Badge
                                variant={nfe.status === 'success' ? 'default' : nfe.status === 'pending' ? 'secondary' : 'destructive'}
                                className="mt-0.5"
                              >
                                {nfe.status === 'success' ? '✅ Emitida' : nfe.status === 'pending' ? '⏳ Pendente' : '❌ Erro'}
                              </Badge>
                            </div>
                          </div>
                          {nfe.status === 'success' && nfe.nfe_xml_url && (
                            <Button size="sm" variant="outline" onClick={() => window.open(nfe.nfe_xml_url!, '_blank')} className="w-full">
                              📥 Download XML
                            </Button>
                          )}
                          {nfe.status === 'error' && nfe.error_message && (
                            <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">Erro: {nfe.error_message}</div>
                          )}
                        </div>
                      ))}
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

export function OrdersManagement() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; cpf: string }>>({});
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [trackingCodes, setTrackingCodes] = useState<Record<string, string>>({});
  const [emittingNFCe, setEmittingNFCe] = useState<Set<string>>(new Set());
  const [labelOrder, setLabelOrder] = useState<Order | null>(null);
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
          ),
          nfe_emissions (
            id,
            nfe_number,
            nfe_key,
            nfe_xml_url,
            status,
            emitted_at,
            error_message
          )
        `)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

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

      setProfiles(profilesMap);
      setOrders((ordersData || []) as Order[]);
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

  const updateOrderStatus = async (orderId: string, newStatus: Order['status']) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus as any })
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

  const verifyPayment = async (orderId: string) => {
    toast({
      title: 'Verificando pagamento...',
      description: 'Consultando Mercado Pago'
    });

    try {
      const { data, error } = await supabase.functions.invoke('verify-payment', {
        body: { orderId }
      });

      if (error) throw error;

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
          description: data.message,
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

  const deleteOrder = async (orderId: string) => {
    // Primeiro deletar os itens do pedido
    const { error: itemsError } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', orderId);

    if (itemsError) {
      toast({
        title: 'Erro ao deletar itens',
        description: itemsError.message,
        variant: 'destructive'
      });
      return;
    }

    // Depois deletar o pedido
    const { error: orderError } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId);

    if (orderError) {
      toast({
        title: 'Erro ao deletar pedido',
        description: orderError.message,
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Pedido deletado',
        description: 'O pedido foi removido com sucesso.'
      });
      loadOrders();
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
        .select('total_amount, customer_id, customers(full_name, cpf)')
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;

      const payload = {
        order_id: orderId,
        payment_method: 'dinheiro' as const,
        total_amount: Number(order.total_amount),
        customer: order.customers ? {
          cpf: (order.customers as any).cpf || undefined,
          nome: (order.customers as any).full_name || undefined,
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

  // Separar pedidos por origem (Site vs PDV)
  const siteOrders = orders.filter(o => ((o as any).source ?? 'site') === 'site');
  const pdvOrders = orders.filter(o => (o as any).source === 'pdv');

  const site = {
    semPagamento: siteOrders.filter(o => o.status === 'aguardando_pagamento'),
    paraEnviar: siteOrders.filter(o => o.status === 'em_preparo' && o.delivery_type === 'delivery'),
    prontoRetirar: siteOrders.filter(o => o.status === 'em_preparo' && o.delivery_type === 'pickup'),
    emCaminho: siteOrders.filter(o => o.status === 'enviado'),
    entregues: siteOrders.filter(o => o.status === 'entregado' || o.status === 'retirado'),
  };

  const pdv = {
    semPagamento: pdvOrders.filter(o => o.status === 'aguardando_pagamento'),
    prontoRetirar: pdvOrders.filter(o => o.status === 'em_preparo'),
    finalizadas: pdvOrders.filter(o => o.status === 'entregado' || o.status === 'retirado'),
  };

  const tableProps = {
    profiles,
    expandedOrders,
    toggleOrderExpansion,
    updateOrderStatus,
    deleteOrder,
    verifyPayment,
    trackingCodes,
    setTrackingCodes,
    updateTrackingCode,
    emitNFCe,
    emittingNFCe,
    openLabelDialog: (o: Order) => setLabelOrder(o),
  };

  const renderSiteTabs = () => (
    <Tabs defaultValue="sem-pagamento" className="space-y-4">
      <div className="-mx-3 md:mx-0 px-3 md:px-0 overflow-x-auto scrollbar-hide">
        <TabsList className="inline-flex md:grid w-max md:w-full md:grid-cols-5 gap-1">
          <TabsTrigger value="sem-pagamento" className="shrink-0">
            <Clock className="w-4 h-4 mr-2" />
            Sem Pagamento
            {site.semPagamento.length > 0 && (
              <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.semPagamento.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="para-enviar" className="shrink-0">
            <Package className="w-4 h-4 mr-2" />
            Para Enviar
            {site.paraEnviar.length > 0 && (
              <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.paraEnviar.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pronto-retirar" className="shrink-0">
            <Store className="w-4 h-4 mr-2" />
            Pronto p/ Retirar
            {site.prontoRetirar.length > 0 && (
              <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.prontoRetirar.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="em-caminho" className="shrink-0">
            <Truck className="w-4 h-4 mr-2" />
            Em Caminho
            {site.emCaminho.length > 0 && (
              <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.emCaminho.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="entregues" className="shrink-0">
            <PackageCheck className="w-4 h-4 mr-2" />
            Entregues
            {site.entregues.length > 0 && (
              <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.entregues.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="sem-pagamento"><OrdersTable orders={site.semPagamento} {...tableProps} /></TabsContent>
      <TabsContent value="para-enviar"><OrdersTable orders={site.paraEnviar} {...tableProps} /></TabsContent>
      <TabsContent value="pronto-retirar"><OrdersTable orders={site.prontoRetirar} {...tableProps} /></TabsContent>
      <TabsContent value="em-caminho"><OrdersTable orders={site.emCaminho} {...tableProps} /></TabsContent>
      <TabsContent value="entregues"><OrdersTable orders={site.entregues} {...tableProps} /></TabsContent>
    </Tabs>
  );

  const renderPdvTabs = () => (
    <Tabs defaultValue="finalizadas" className="space-y-4">
      <div className="-mx-3 md:mx-0 px-3 md:px-0 overflow-x-auto scrollbar-hide">
        <TabsList className="inline-flex md:grid w-max md:w-full md:grid-cols-3 gap-1">
          <TabsTrigger value="sem-pagamento" className="shrink-0">
            <Clock className="w-4 h-4 mr-2" />
            Sem Pagamento
            {pdv.semPagamento.length > 0 && (
              <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{pdv.semPagamento.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pronto-retirar" className="shrink-0">
            <Store className="w-4 h-4 mr-2" />
            Pronto p/ Retirar
            {pdv.prontoRetirar.length > 0 && (
              <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{pdv.prontoRetirar.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="finalizadas" className="shrink-0">
            <PackageCheck className="w-4 h-4 mr-2" />
            Finalizadas
            {pdv.finalizadas.length > 0 && (
              <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{pdv.finalizadas.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="sem-pagamento"><OrdersTable orders={pdv.semPagamento} {...tableProps} /></TabsContent>
      <TabsContent value="pronto-retirar"><OrdersTable orders={pdv.prontoRetirar} {...tableProps} /></TabsContent>
      <TabsContent value="finalizadas"><OrdersTable orders={pdv.finalizadas} {...tableProps} /></TabsContent>
    </Tabs>
  );

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
                <h2 className="text-lg md:text-2xl font-bold tracking-tight leading-tight">Gestão de Pedidos</h2>
                <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 md:line-clamp-none">
                  Pedidos do site e vendas do PDV organizados por status
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
              <div className="shrink-0 px-3 py-1.5 md:px-4 md:py-2 rounded-lg bg-background/80 backdrop-blur border min-w-[88px] md:min-w-[110px]">
                <p className="text-[9px] md:text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Receita</p>
                <p className="text-base md:text-xl font-bold text-primary">R$ {totalRevenue.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CardContent className="p-3 md:p-6">
        <Tabs defaultValue="site" className="space-y-4">
          <TabsList className="grid grid-cols-2 max-w-md h-11">
            <TabsTrigger value="site" className="gap-2">
              🌐 Site
              <Badge className="h-5 min-w-5 px-1.5" variant="secondary">{siteOrders.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="pdv" className="gap-2">
              🏪 PDV
              <Badge className="h-5 min-w-5 px-1.5" variant="secondary">{pdvOrders.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="site">{renderSiteTabs()}</TabsContent>
          <TabsContent value="pdv">{renderPdvTabs()}</TabsContent>
        </Tabs>
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
