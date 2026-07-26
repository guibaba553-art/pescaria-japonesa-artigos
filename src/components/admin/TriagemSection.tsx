import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { TriagemScanDialog, TriagemOrder } from '@/components/TriagemScanDialog';
import { CancelOrderWithRefundDialog } from '@/components/OrdersManagement';
import { statusConfig, getStatusLabel } from '@/lib/orderStatus';
import {
  Package,
  Truck,
  Store,
  ChevronRight,
  ChevronDown,
  Loader2,
  ScanBarcode,
  XCircle,
} from 'lucide-react';

interface Order {
  id: string;
  total_amount: number;
  shipping_cost: number;
  status: string;
  created_at: string;
  user_id: string;
  shipping_cep: string;
  delivery_type: 'delivery' | 'pickup';
  payment_gateway?: string | null;
  payment_method?: string | null;
  payment_id?: string | null;
  asaas_payment_id?: string | null;
  card_brand?: string | null;
  card_last_digits?: string | null;
  qr_code_base64?: string | null;
  order_items: Array<{ id: string; quantity: number; price_at_purchase?: number; products: { name: string } }>;
}

interface TriagemSectionProps {
  orders: Order[];
  profiles: Record<string, { name: string; cpf: string }>;
  onStatusChanged: () => void;
  openLabelDialog: (order: Order) => void;
  cancelOrder: (orderId: string, reason: string) => Promise<void>;
  cancellingOrders: Set<string>;
}

export function TriagemSection({ orders, profiles, onStatusChanged, openLabelDialog, cancelOrder, cancellingOrders }: TriagemSectionProps) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<'all' | 'delivery' | 'pickup'>('all');
  const [selectedOrder, setSelectedOrder] = useState<TriagemOrder | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'pickup' | 'pack'>('pickup');
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const lastHandledQrRef = useRef<string | null>(null);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (filter === 'delivery') return o.delivery_type === 'delivery';
      if (filter === 'pickup') return o.delivery_type === 'pickup';
      return true;
    });
  }, [orders, filter]);

  const toggleExpansion = (orderId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const fetchOrderDetail = useCallback(async (orderId: string): Promise<TriagemOrder | null> => {
    setLoadingOrderId(orderId);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `id, total_amount, shipping_cost, shipping_address, shipping_cep, status, delivery_type, source, created_at, user_id, tracking_code, shipping_label_url, shipping_label_order_id,
           order_items(id, quantity, price_at_purchase, product_id, variation_id, products(name, image_url, sku, weight_grams, length_cm, width_cm, height_cm), product_variations(name, sku, weight_grams, length_cm, width_cm, height_cm)),
           nfe_emissions(id, nfe_number, danfe_url, status)`,
        )
        .eq('id', orderId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast({
          title: 'Pedido não encontrado',
          description: `Nenhum pedido com ID ${orderId.slice(0, 8)}.`,
          variant: 'destructive',
        });
        return null;
      }

      if (data.status !== 'em_preparo') {
        toast({
          title: 'Pedido não está em preparo',
          description: `Status atual: ${data.status}. Triagem só abre pedidos em preparo.`,
          variant: 'destructive',
        });
        return null;
      }

      let profile: any = null;
      if ((data as any).user_id) {
        const { data: p } = await supabase
          .from('profiles')
          .select('id, full_name, phone, cpf')
          .eq('id', (data as any).user_id)
          .maybeSingle();
        profile = p || null;
      }

      const nfes = ((data as any).nfe_emissions || []) as any[];
      const authorized = nfes.find(
        (n: any) => n.status === 'autorizada' || n.status === 'authorized',
      );
      const nfe = authorized || nfes[0] || null;

      return {
        ...(data as any),
        profile,
        nfe: nfe
          ? { id: nfe.id, nfe_number: nfe.nfe_number, danfe_url: nfe.danfe_url, status: nfe.status }
          : null,
      };
    } catch (err: any) {
      console.error('[TriagemSection] fetch error:', err);
      toast({
        title: 'Erro ao buscar pedido',
        description: err.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoadingOrderId(null);
    }
  }, [toast]);

  const openScanFor = useCallback(async (orderId: string, deliveryType: string) => {
    const detail = await fetchOrderDetail(orderId);
    if (!detail) return;
    setDialogMode(deliveryType === 'pickup' ? 'pickup' : 'pack');
    setSelectedOrder(detail);
    setScanOpen(true);
  }, [fetchOrderDetail]);

  const extractOrderId = (raw: string): string | null => {
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const m = raw.match(uuidRe);
    return m ? m[0].toLowerCase() : null;
  };

  const openOrderById = useCallback(async (orderId: string) => {
    const found = filteredOrders.find((o) => o.id.toLowerCase() === orderId);
    if (found) {
      openScanFor(found.id, found.delivery_type);
      return;
    }
    const detail = await fetchOrderDetail(orderId);
    if (!detail) return;
    setDialogMode(detail.delivery_type === 'pickup' ? 'pickup' : 'pack');
    setSelectedOrder(detail);
    setScanOpen(true);
  }, [filteredOrders, openScanFor, fetchOrderDetail]);

  useEffect(() => {
    let buffer = '';
    let lastTime = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target as any)?.isContentEditable;
      if (isEditable) return;
      if (scanOpen) return;

      const now = Date.now();
      if (now - lastTime > 80) buffer = '';
      lastTime = now;

      if (e.key === 'Enter') {
        const orderId = extractOrderId(buffer);
        buffer = '';
        if (orderId && lastHandledQrRef.current !== orderId) {
          lastHandledQrRef.current = orderId;
          openOrderById(orderId);
        }
        return;
      }

      if (e.key.length === 1) {
        buffer += e.key;
        const orderId = extractOrderId(buffer);
        if (orderId && lastHandledQrRef.current !== orderId) {
          lastHandledQrRef.current = orderId;
          buffer = '';
          openOrderById(orderId);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [scanOpen, openOrderById]);

  const handleDialogComplete = useCallback(() => {
    onStatusChanged();
    lastHandledQrRef.current = null;
  }, [onStatusChanged]);

  const activeBtnClass = (f: string) => {
    if (f === 'all') return 'bg-primary text-primary-foreground hover:bg-primary/90';
    if (f === 'delivery') return 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600';
    return 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600';
  };

  const inactiveBtnClass = (f: string) => {
    if (f === 'all') return '';
    if (f === 'delivery') return 'border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 hover:text-blue-800 dark:hover:text-blue-200';
    return 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 hover:text-emerald-800 dark:hover:text-emerald-200';
  };

  return (
    <div>
      {/* Sub-filter */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-sm text-muted-foreground font-medium">Filtrar:</span>
        <div className="flex gap-2">
          {(['all', 'delivery', 'pickup'] as const).map((f) => {
            const isActive = filter === f;
            return (
              <Button
                key={f}
                size="default"
                variant={isActive ? 'default' : 'outline'}
                onClick={() => setFilter(f)}
                className={`gap-1.5 text-sm px-4 ${isActive ? activeBtnClass(f) : inactiveBtnClass(f)}`}
              >
                {f === 'delivery' && <Truck className={`w-4 h-4 ${isActive ? '' : 'text-blue-600 dark:text-blue-400'}`} />}
                {f === 'pickup' && <Store className={`w-4 h-4 ${isActive ? '' : 'text-emerald-600 dark:text-emerald-400'}`} />}
                {f === 'all' ? 'Todos' : f === 'delivery' ? 'Entrega' : 'Retirada'}
              </Button>
            );
          })}
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum pedido em preparo aguardando triagem.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredOrders.map((order) => {
            const cfg = statusConfig[order.status as keyof typeof statusConfig] || statusConfig.em_preparo;
            const StatusIcon = cfg.icon;
            const customerName = profiles[order.user_id]?.name || 'Carregando...';
            const customerCpf = profiles[order.user_id]?.cpf || 'N/A';
            const gwLabel = order.payment_gateway === 'asaas' ? 'Asaas' : order.payment_gateway === 'mercadopago' ? 'Mercado Pago' : order.payment_gateway || '';
            const methodLabel = order.payment_method === 'pix' ? 'PIX' : order.payment_method === 'credit_card' ? 'Cartão de Crédito' : order.payment_method === 'debit_card' ? 'Cartão de Débito' : order.card_brand ? 'Cartão' : order.qr_code_base64 ? 'PIX' : order.payment_method || '';
            const isLoading = loadingOrderId === order.id;
            const isExpanded = expandedOrders.has(order.id);
            const subtotal = order.order_items.reduce((s, it) => s + (it.price_at_purchase || 0) * (it.quantity || 0), 0);
            const total = subtotal + (order.shipping_cost || 0);
            const hasPayment = !!(order.payment_gateway && (order.payment_id || order.asaas_payment_id));

            return (
              <Collapsible
                key={order.id}
                open={isExpanded}
                onOpenChange={() => toggleExpansion(order.id)}
              >
                <Card
                  onClick={() => !isLoading && openScanFor(order.id, order.delivery_type)}
                  className={`border-l-4 ${cfg.accentClass} transition-all hover:shadow-md overflow-hidden cursor-pointer group ${isLoading ? 'opacity-60 pointer-events-none' : ''}`}
                >
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
                            {getStatusLabel(order.status as any, order.delivery_type)}
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
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <div>
                        <p className="text-2xl font-bold text-primary leading-tight">
                          R$ {total.toFixed(2)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {order.order_items.length} {order.order_items.length === 1 ? 'item' : 'itens'}
                        </p>
                      </div>
                      {isLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                      )}
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
                  <div className="px-4 pb-4 flex items-center gap-1.5 md:gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'}
                      </Button>
                    </CollapsibleTrigger>

                    <Button
                      size="sm"
                      onClick={() => openScanFor(order.id, order.delivery_type)}
                      disabled={isLoading}
                      className="gap-1"
                    >
                      {isLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ScanBarcode className="h-3.5 w-3.5" />
                      )}
                      Clique para triagem
                    </Button>

                    {order.delivery_type === 'delivery' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openLabelDialog(order)}
                        className="gap-1 border-blue-500/40 text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
                      >
                        <Truck className="h-3.5 w-3.5" />
                        Gerar Etiqueta
                      </Button>
                    )}

                    {hasPayment ? (
                      <CancelOrderWithRefundDialog
                        order={order}
                        customerName={customerName}
                        gwLabel={gwLabel}
                        methodLabel={methodLabel}
                        onCancel={(reason) => cancelOrder(order.id, reason)}
                        isProcessing={cancellingOrders.has(order.id)}
                      />
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400"
                            disabled={cancellingOrders.has(order.id)}
                          >
                            {cancellingOrders.has(order.id) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5" />
                            )}
                            Cancelar Pedido
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancelar pedido</AlertDialogTitle>
                            <AlertDialogDescription asChild>
                              <div>
                                Tem certeza que deseja cancelar este pedido? Esta ação não pode ser desfeita.
                                <div className="mt-3 p-3 bg-muted rounded-md text-sm space-y-1">
                                  <div><strong>Pedido:</strong> #{order.id.slice(0, 8)}</div>
                                  <div><strong>Cliente:</strong> {customerName}</div>
                                  <div><strong>Total:</strong> R$ {total.toFixed(2)}</div>
                                </div>
                              </div>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Voltar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => cancelOrder(order.id, 'cancelado_admin')}
                              className="bg-red-600 hover:bg-red-700 text-white"
                            >
                              Confirmar cancelamento
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>

                  {/* Detalhes expandidos */}
                  <CollapsibleContent onClick={(e) => e.stopPropagation()}>
                    <div className="px-4 pb-4 border-t space-y-4">
                      <div className="pt-4 space-y-2">
                        <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Itens do Pedido</h4>
                        {order.order_items.map((item, idx) => (
                          <div key={item.id || idx} className="flex items-center justify-between text-sm">
                            <span className="flex-1 min-w-0">
                              <span className="font-medium">{item.products?.name || 'Produto'}</span>
                              <span className="text-muted-foreground ml-2">x{item.quantity}</span>
                            </span>
                            <span className="font-mono text-sm shrink-0 ml-4">
                              R$ {((item.price_at_purchase || 0) * (item.quantity || 0)).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-1.5 pt-2 border-t">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="font-mono">R$ {subtotal.toFixed(2)}</span>
                        </div>
                        {order.shipping_cost > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Frete</span>
                            <span className="font-mono">R$ {order.shipping_cost.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm font-semibold pt-1 border-t">
                          <span>Total</span>
                          <span className="font-mono">R$ {total.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}

      <TriagemScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        order={selectedOrder}
        mode={dialogMode}
        onCompleted={handleDialogComplete}
      />
    </div>
  );
}
