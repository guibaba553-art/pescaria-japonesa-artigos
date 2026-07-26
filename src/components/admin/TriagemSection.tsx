import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TriagemScanDialog, TriagemOrder } from '@/components/TriagemScanDialog';
import {
  Package,
  Truck,
  Store,
  User,
  ChevronRight,
  Loader2,
} from 'lucide-react';

interface Order {
  id: string;
  total_amount: number;
  shipping_cost: number;
  status: string;
  created_at: string;
  user_id: string;
  delivery_type: 'delivery' | 'pickup';
  order_items: Array<{ id: string; quantity: number; products: { name: string } }>;
}

interface TriagemSectionProps {
  orders: Order[];
  onStatusChanged: () => void;
}

export function TriagemSection({ orders, onStatusChanged }: TriagemSectionProps) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<'all' | 'delivery' | 'pickup'>('all');
  const [selectedOrder, setSelectedOrder] = useState<TriagemOrder | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'pickup' | 'pack'>('pickup');
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const lastHandledQrRef = useRef<string | null>(null);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (filter === 'delivery') return o.delivery_type === 'delivery';
      if (filter === 'pickup') return o.delivery_type === 'pickup';
      return true;
    });
  }, [orders, filter]);

  // --- Fetch full TriagemOrder detail when opening dialog ---

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

  // --- Open dialog for an order ---

  const openScanFor = useCallback(async (orderId: string, deliveryType: string) => {
    const detail = await fetchOrderDetail(orderId);
    if (!detail) return;
    setDialogMode(deliveryType === 'pickup' ? 'pickup' : 'pack');
    setSelectedOrder(detail);
    setScanOpen(true);
  }, [fetchOrderDetail]);

  // --- Card click handler ---

  const handleCardClick = useCallback((order: Order) => {
    openScanFor(order.id, order.delivery_type);
  }, [openScanFor]);

  // --- QR / Barcode detection ---

  const extractOrderId = (raw: string): string | null => {
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const m = raw.match(uuidRe);
    return m ? m[0].toLowerCase() : null;
  };

  const openOrderById = useCallback(async (orderId: string) => {
    // Check if the order is in our current filteredOrders list
    const found = filteredOrders.find((o) => o.id.toLowerCase() === orderId);
    if (found) {
      openScanFor(found.id, found.delivery_type);
      return;
    }
    // Not in list — fetch from DB directly
    const detail = await fetchOrderDetail(orderId);
    if (!detail) return;
    setDialogMode(detail.delivery_type === 'pickup' ? 'pickup' : 'pack');
    setSelectedOrder(detail);
    setScanOpen(true);
  }, [filteredOrders, openScanFor, fetchOrderDetail]);

  // Global keyboard listener for barcode scanners
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

  // --- Render ---

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
      {/* Sub-filter: Todos / Entrega / Retirada */}
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
          {filteredOrders.map((o) => {
            const totalUnits = o.order_items.reduce((s, it) => s + (it.quantity || 0), 0);
            const isLoading = loadingOrderId === o.id;
            return (
              <button
                key={o.id}
                onClick={() => handleCardClick(o)}
                disabled={isLoading}
                className={`group text-left bg-card border-2 rounded-2xl p-4 hover:shadow-md transition-all cursor-pointer
                  ${o.delivery_type === 'pickup'
                    ? 'border-l-4 border-l-emerald-500 hover:border-emerald-500/40'
                    : 'border-l-4 border-l-blue-500 hover:border-blue-500/40'}
                  ${isLoading ? 'opacity-60 pointer-events-none' : ''}
                `}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold">#{o.id.slice(0, 8)}</span>
                      {o.delivery_type === 'pickup' ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                          <Store className="w-3 h-3 mr-1" /> Retirada
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30">
                          <Truck className="w-3 h-3 mr-1" /> Envio
                        </Badge>
                      )}
                    </div>
                    {isLoading ? (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Carregando detalhes...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-sm text-foreground/80 mt-1.5">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="truncate">{'Clique para triagem'}</span>
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {o.order_items.length} item(ns) · {totalUnits} unidade(s)
                  </span>
                  <span className="font-bold text-foreground">
                    {o.total_amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {new Date(o.created_at).toLocaleString('pt-BR')}
                </div>
              </button>
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
