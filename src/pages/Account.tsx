import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Package, Truck, CheckCircle, Home, Star, QrCode, FileText, Download, ExternalLink, Copy, Store, MapPin, User } from 'lucide-react';
import { ReviewDialog } from '@/components/ReviewDialog';
import { PixPaymentDialog } from '@/components/PixPaymentDialog';
import { PickupQRDialog } from '@/components/PickupQRDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MyAddresses } from '@/components/MyAddresses';
import { MyProfile } from '@/components/MyProfile';

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  price_at_purchase: number;
  products: {
    name: string;
    image_url: string | null;
  };
}

interface NfeEmission {
  id: string;
  status: string;
  nfe_number: string | null;
  nfe_key: string | null;
  danfe_url: string | null;
  nfe_xml_url: string | null;
  emitted_at: string | null;
}

interface Order {
  id: string;
  total_amount: number;
  shipping_cost: number;
  shipping_address: string;
  status: 'aguardando_pagamento' | 'em_preparo' | 'enviado' | 'entregue' | 'entregado' | 'retirado' | 'cancelado';
  created_at: string;
  tracking_code?: string;
  delivery_type?: 'delivery' | 'pickup';
  order_items: OrderItem[];
  qr_code: string | null;
  qr_code_base64: string | null;
  ticket_url: string | null;
  pix_expiration: string | null;
  nfe_emissions?: NfeEmission[];
}

const statusConfig: Record<string, { label: string; icon: typeof Package; color: string }> = {
  aguardando_pagamento: { label: 'Aguardando Pagamento', icon: Package, color: 'bg-orange-500' },
  em_preparo: { label: 'Em Preparo', icon: Package, color: 'bg-yellow-500' },
  enviado: { label: 'Enviado', icon: Truck, color: 'bg-blue-500' },
  entregue: { label: 'Entregue', icon: CheckCircle, color: 'bg-green-500' },
  entregado: { label: 'Entregue', icon: CheckCircle, color: 'bg-green-500' },
  retirado: { label: 'Retirado', icon: CheckCircle, color: 'bg-emerald-600' },
  cancelado: { label: 'Cancelado', icon: Package, color: 'bg-red-500' },
};

const getStatusConfig = (status: string, deliveryType?: string) => {
  const cfg = statusConfig[status] ?? { label: status, icon: Package, color: 'bg-gray-500' };
  if (status === 'em_preparo' && deliveryType === 'pickup') {
    return { ...cfg, label: 'Pronto para Retirar', color: 'bg-emerald-500' };
  }
  return cfg;
};

export default function Account() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const { clearCart } = useCart();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<{
    orderId: string;
    productId: string;
    productName: string;
  } | null>(null);
  const [reviewedProducts, setReviewedProducts] = useState<Set<string>>(new Set());
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [selectedPixPayment, setSelectedPixPayment] = useState<{
    qrCode: string;
    qrCodeBase64: string;
    ticketUrl?: string;
    expiresAt?: string;
    orderId: string;
  } | null>(null);
  const [pickupQROrderId, setPickupQROrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      loadOrders();

      // Configurar realtime para atualizar automaticamente quando pedidos mudarem
      const channel = supabase
        .channel('user-orders-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('Order status changed:', payload);
            loadOrders(); // Recarregar pedidos automaticamente
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  // Tratar retorno do checkout do Mercado Pago (Google Pay / cartão)
  useEffect(() => {
    if (!user) return;
    const paymentParam = searchParams.get('payment');
    if (!paymentParam) return;

    const pendingRaw = sessionStorage.getItem('pendingCheckout');
    const pending = pendingRaw ? (() => { try { return JSON.parse(pendingRaw); } catch { return null; } })() : null;

    const cleanup = () => {
      sessionStorage.removeItem('pendingCheckout');
      searchParams.delete('payment');
      searchParams.delete('status');
      searchParams.delete('collection_status');
      searchParams.delete('payment_id');
      searchParams.delete('preference_id');
      searchParams.delete('external_reference');
      setSearchParams(searchParams, { replace: true });
    };

    if (paymentParam === 'success') {
      // Pagamento confirmado — limpar carrinho e atualizar pedidos
      clearCart();
      toast({
        title: '✅ Pagamento confirmado!',
        description: 'Seu pedido foi recebido e está sendo processado.',
      });
      loadOrders();
      cleanup();
      return;
    }

    // failure ou pending (usuário voltou / cancelou / recusado):
    // cancelar o pedido pendente e manter o carrinho intacto
    (async () => {
      const orderId = pending?.orderId;
      if (orderId) {
        try {
          await supabase.functions.invoke('cancel-checkout-order', {
            body: { orderId },
          });
        } catch (err) {
          console.error('Erro ao cancelar pedido pendente', err);
        }
      }
      toast({
        title: paymentParam === 'failure' ? '❌ Pagamento não concluído' : 'Pagamento cancelado',
        description: 'Seus itens continuam no carrinho. Você pode tentar novamente quando quiser.',
        variant: 'destructive',
      });
      loadOrders();
      cleanup();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, searchParams.get('payment')]);

  const loadOrders = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          products (name, image_url)
        ),
        nfe_emissions (
          id, status, nfe_number, nfe_key, danfe_url, nfe_xml_url, emitted_at
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setOrders(data as Order[]);
      
      // Carregar avaliações existentes
      const { data: reviews } = await supabase
        .from('reviews')
        .select('order_id, product_id')
        .eq('user_id', user.id);
      
      if (reviews) {
        const reviewedSet = new Set(
          reviews.map(r => `${r.order_id}_${r.product_id}`)
        );
        setReviewedProducts(reviewedSet);
      }
    }
    setLoadingOrders(false);
  };

  const handleOpenReviewDialog = (orderId: string, productId: string, productName: string) => {
    setSelectedReview({ orderId, productId, productName });
    setReviewDialogOpen(true);
  };

  const handleReviewSubmitted = () => {
    loadOrders();
  };

  const handleOpenPixDialog = (order: Order) => {
    if (order.qr_code && order.qr_code_base64) {
      setSelectedPixPayment({
        qrCode: order.qr_code,
        qrCodeBase64: order.qr_code_base64,
        ticketUrl: order.ticket_url || undefined,
        expiresAt: order.pix_expiration || undefined,
        orderId: order.id
      });
      setPixDialogOpen(true);
    }
  };

  if (loading || loadingOrders) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header />
        <div className="flex items-center justify-center h-[80vh]">
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />

      {/* Commercial dark banner */}
      <div className="bg-foreground text-background pt-20 lg:pt-32 pb-8">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary mb-3">
                <Package className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Minha conta</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-black tracking-tight">
                Meus Pedidos
              </h1>
              <p className="text-sm text-background/60 mt-1">
                Acompanhe status, rastreio, notas fiscais e avalie seus produtos.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground self-start md:self-end"
            >
              <Home className="w-4 h-4 mr-2" />
              Voltar à Home
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 -mt-4 space-y-6">
        <Card className="rounded-2xl border-border">
          <CardContent className="p-6 space-y-6">
            {orders.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Você ainda não fez nenhum pedido
              </p>
            ) : (
              orders.map((order) => {
                const cfg = getStatusConfig(order.status, order.delivery_type);
                const StatusIcon = cfg.icon;
                return (
                  <div key={order.id} className="border rounded-lg p-4 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Pedido #{order.id.slice(0, 8)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        <Badge className={cfg.color}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {cfg.label}
                        </Badge>
                        {order.status === 'aguardando_pagamento' && order.qr_code && order.qr_code_base64 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenPixDialog(order)}
                          >
                            <QrCode className="w-4 h-4 mr-2" />
                            Ver QR Code PIX
                          </Button>
                        )}
                        {order.delivery_type === 'pickup' && order.status === 'em_preparo' && (
                          <Button
                            size="sm"
                            onClick={() => setPickupQROrderId(order.id)}
                          >
                            <Store className="w-4 h-4 mr-2" />
                            QR de Retirada
                          </Button>
                        )}
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      {order.order_items.map((item) => {
                        const isReviewed = reviewedProducts.has(`${order.id}_${item.product_id}`);
                        const canReview = (order.status === 'entregue' || order.status === 'entregado') && !isReviewed;
                        
                        return (
                          <div key={item.id} className="flex gap-3 items-start">
                            {item.products.image_url && (
                              <img
                                src={item.products.image_url}
                                alt={item.products.name}
                                className="w-16 h-16 object-cover rounded"
                              />
                            )}
                            <div className="flex-1">
                              <p className="font-medium">{item.products.name}</p>
                              <p className="text-sm text-muted-foreground">
                                Quantidade: {item.quantity}
                              </p>
                              {canReview && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-2"
                                  onClick={() => handleOpenReviewDialog(
                                    order.id,
                                    item.product_id,
                                    item.products.name
                                  )}
                                >
                                  <Star className="w-4 h-4 mr-1" />
                                  Avaliar Produto
                                </Button>
                              )}
                              {isReviewed && (
                                <Badge variant="secondary" className="mt-2">
                                  <Star className="w-3 h-3 mr-1 fill-current" />
                                  Avaliado
                                </Badge>
                              )}
                            </div>
                            <p className="font-medium">
                              R$ {(item.price_at_purchase * item.quantity).toFixed(2)}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    <Separator />

                    {order.tracking_code && (order.status === 'enviado' || order.status === 'entregue' || order.status === 'entregado') && (
                      <>
                        <div className="p-3 bg-primary/5 rounded-md border border-primary/10 space-y-2">
                          <div className="flex items-center gap-2">
                            <Truck className="w-4 h-4 text-primary" />
                            <p className="text-sm font-medium">Código de Rastreio</p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-base font-mono font-semibold text-primary bg-background px-2 py-1 rounded border">
                              {order.tracking_code}
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                navigator.clipboard.writeText(order.tracking_code!);
                                toast({ title: 'Código copiado!', description: 'Cole no site da transportadora.' });
                              }}
                            >
                              <Copy className="w-3 h-3 mr-1" /> Copiar
                            </Button>
                            <Button
                              size="sm"
                              asChild
                            >
                              <a
                                href={`https://www.melhorrastreio.com.br/rastreio/${order.tracking_code}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="w-3 h-3 mr-1" /> Rastrear pedido
                              </a>
                            </Button>
                          </div>
                        </div>
                      </>
                    )}

                    {(() => {
                      const nfe = order.nfe_emissions?.find(
                        (n) => n.status === 'autorizada' || n.status === 'emitida' || n.status === 'authorized'
                      );
                      if (!nfe) return null;
                      return (
                        <div className="p-3 bg-primary/5 rounded-md border border-primary/20 space-y-2">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <p className="text-sm font-medium">Nota Fiscal Eletrônica</p>
                            {nfe.nfe_number && (
                              <Badge variant="outline" className="text-xs">
                                Nº {nfe.nfe_number}
                              </Badge>
                            )}
                          </div>
                          {nfe.nfe_key && (
                            <p className="text-xs text-muted-foreground font-mono break-all">
                              Chave: {nfe.nfe_key}
                            </p>
                          )}
                          <div className="flex items-center gap-2 flex-wrap pt-1">
                            {nfe.danfe_url && (
                              <Button size="sm" asChild>
                                <a href={nfe.danfe_url} target="_blank" rel="noopener noreferrer">
                                  <Download className="w-3 h-3 mr-1" /> Baixar DANFE (PDF)
                                </a>
                              </Button>
                            )}
                            {nfe.nfe_xml_url && (
                              <Button size="sm" variant="outline" asChild>
                                <a href={nfe.nfe_xml_url} target="_blank" rel="noopener noreferrer">
                                  <Download className="w-3 h-3 mr-1" /> Baixar XML
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    <Separator />

                    <div className="flex justify-between text-sm">
                      <span>Frete:</span>
                      <span>R$ {order.shipping_cost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span>Total:</span>
                      <span className="text-primary">
                        R$ {order.total_amount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {selectedReview && (
        <ReviewDialog
          open={reviewDialogOpen}
          onOpenChange={setReviewDialogOpen}
          orderId={selectedReview.orderId}
          productId={selectedReview.productId}
          productName={selectedReview.productName}
          onReviewSubmitted={handleReviewSubmitted}
        />
      )}

      {selectedPixPayment && (
        <PixPaymentDialog
          open={pixDialogOpen}
          onOpenChange={setPixDialogOpen}
          qrCode={selectedPixPayment.qrCode}
          qrCodeBase64={selectedPixPayment.qrCodeBase64}
          ticketUrl={selectedPixPayment.ticketUrl}
          expiresAt={selectedPixPayment.expiresAt}
          orderId={selectedPixPayment.orderId}
        />
      )}

      {pickupQROrderId && (
        <PickupQRDialog
          open={!!pickupQROrderId}
          onOpenChange={(open) => !open && setPickupQROrderId(null)}
          orderId={pickupQROrderId}
        />
      )}
    </div>
  );
}