import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Package, Truck, CheckCircle, Home, Star, QrCode, FileText, Download, ExternalLink, Copy, Store, MapPin, User, CreditCard, Trash2, Mail, Loader2 } from 'lucide-react';
import { ReviewDialog } from '@/components/ReviewDialog';
import { PixPaymentDialog } from '@/components/PixPaymentDialog';
import { CreditCardForm, type CreditCardFormData } from '@/components/CreditCardForm';
import { PickupQRDialog } from '@/components/PickupQRDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MyAddresses } from '@/components/MyAddresses';
import { MyProfile } from '@/components/MyProfile';
import { MyPaymentMethods } from '@/components/MyPaymentMethods';
import { OrderTrackingTimeline } from '@/components/OrderTrackingTimeline';
import { OrderTrackingDialog } from '@/components/OrderTrackingDialog';
import { PAYMENT_CONFIG } from '@/config/constants';
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
    gateway?: 'abacatepay' | 'asaas';
  } | null>(null);
  const [pickupQROrderId, setPickupQROrderId] = useState<string | null>(null);
  const [trackingDialog, setTrackingDialog] = useState<{ orderId: string; code: string } | null>(null);
  const [refreshingPix, setRefreshingPix] = useState<string | null>(null);
  const [retryCardOrderId, setRetryCardOrderId] = useState<string | null>(null);
  const [retryCardData, setRetryCardData] = useState<CreditCardFormData | null>(null);
  const [retryLoading, setRetryLoading] = useState(false);

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

  // Tratar retorno do checkout (Google Pay / cartão)
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
      toast.success('✅ Pagamento confirmado!', { description: 'Seu pedido foi recebido e está sendo processado.' });
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
      toast.error(
        paymentParam === 'failure' ? '❌ Pagamento não concluído' : 'Pagamento cancelado',
        { description: 'Seus itens continuam no carrinho. Você pode tentar novamente quando quiser.' }
      );
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
      .or('source.is.null,source.neq.pdv')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setOrders(data as Order[]);
      
      // Carregar avaliações existentes (apenas as do próprio usuário, via RPC)
      const { data: reviews } = await supabase.rpc('get_my_reviewed_products');

      if (reviews) {
        const reviewedSet = new Set(
          (reviews as { order_id: string; product_id: string }[]).map(
            (r) => `${r.order_id}_${r.product_id}`,
          ),
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
        orderId: order.id,
        gateway: (order as any).payment_gateway || 'abacatepay',
      });
      setPixDialogOpen(true);
    }
  };

  const handleRefreshPix = async (orderId: string) => {
    setRefreshingPix(orderId);
    try {
      const { data, error } = await supabase.functions.invoke('refresh-pix', {
        body: { orderId },
      });

      if (error || !data?.success) {
        toast.error('Erro ao gerar novo PIX', { description: data?.error || error?.message });
        return;
      }

      // Atualiza os dados do pedido com o novo QR
      if (data.data) {
        setSelectedPixPayment({
          qrCode: data.data.brCode || '',
          qrCodeBase64: data.data.brCodeBase64 || '',
          expiresAt: data.data.expiresAt,
          orderId,
          gateway: 'asaas',
        });
        setPixDialogOpen(true);
      }

      // Recarregar pedidos para atualizar lista
      loadOrders();
    } catch (err: any) {
      toast.error('Erro ao gerar novo PIX', { description: err?.message });
    } finally {
      setRefreshingPix(null);
    }
  };

  const handleRetryCard = async () => {
    if (!retryCardOrderId || !retryCardData) return;

    setRetryLoading(true);
    try {
      // Capturar IP do cliente
      let remoteIp = '';
      try {
        const ipResp = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResp.json();
        remoteIp = ipData.ip;
      } catch {
        remoteIp = '127.0.0.1';
      }

      const { data: result, error } = await supabase.functions.invoke('retry-payment-asaas', {
        body: {
          orderId: retryCardOrderId,
          installmentCount: retryCardData.installmentCount,
          saveCard: retryCardData.saveCard,
          creditCard: retryCardData.creditCard,
          creditCardHolderInfo: retryCardData.creditCardHolderInfo,
          creditCardToken: retryCardData.creditCardToken || undefined,
          remoteIp,
          customerData: {
            name: retryCardData.creditCardHolderInfo?.name || '',
            email: retryCardData.creditCardHolderInfo?.email || '',
            cpfCnpj: retryCardData.creditCardHolderInfo?.cpfCnpj || '',
            phone: retryCardData.creditCardHolderInfo?.phone || retryCardData.creditCardHolderInfo?.mobilePhone || '',
          },
        },
      });

      if (error || !result?.success) {
        const attemptsLeft = result?.attemptsRemaining ?? 0;
        if (result?.maxAttemptsReached || attemptsLeft <= 0) {
          toast.error('❌ Número máximo de tentativas atingido', { description: 'Pague com PIX para continuar.' });
          setRetryCardOrderId(null);
        } else {
          toast.error('Cartão recusado', { description: `${attemptsLeft} tentativa(s) restante(s).` });
        }
        loadOrders();
        return;
      }

      // Sucesso
      toast.success('✅ Pagamento aprovado!');
      setRetryCardOrderId(null);
      loadOrders();
    } catch (err: any) {
      toast.error('Erro ao processar pagamento', { description: err?.message });
    } finally {
      setRetryLoading(false);
    }
  };

  const [exporting, setExporting] = useState(false);

  const handleExportData = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const [profile, orders, reviews, messages] = await Promise.all([
        supabase.from("profiles").select("full_name, cpf, cep, phone, created_at").eq("id", user.id).maybeSingle(),
        supabase.from("orders").select("*, order_items(*)").eq("user_id", user.id),
        supabase.from("reviews").select("*").eq("user_id", user.id),
        supabase.from("chat_messages").select("*").eq("user_id", user.id),
      ]);

      const data = {
        exported_at: new Date().toISOString(),
        user: { id: user.id, email: user.email },
        profile: profile.data,
        orders: orders.data,
        reviews: reviews.data,
        messages: messages.data,
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meus-dados-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Dados exportados com sucesso');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao exportar dados');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteRequest = () => {
    const subject = encodeURIComponent("Solicitação de Exclusão de Dados (LGPD)");
    const body = encodeURIComponent(
      `Solicito a exclusão dos meus dados pessoais nos termos do Art. 18 da LGPD.\n\nE-mail da conta: ${user?.email}\nID: ${user?.id}\n\nObservação: dados fiscais devem ser mantidos pelo prazo legal de 5 anos.`
    );
    window.location.href = `mailto:robertobaba2@gmail.com?subject=${subject}&body=${body}`;
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
                Minha Conta
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
        <Tabs defaultValue="pedidos" className="w-full">
          <TabsList className="w-full grid grid-cols-4 h-12 rounded-full p-1">
            <TabsTrigger value="pedidos" className="rounded-full text-sm font-semibold gap-1.5">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Pedidos</span>
            </TabsTrigger>
            <TabsTrigger value="enderecos" className="rounded-full text-sm font-semibold gap-1.5">
              <MapPin className="w-4 h-4" />
              <span className="hidden sm:inline">Endereços</span>
            </TabsTrigger>
            <TabsTrigger value="pagamento" className="rounded-full text-sm font-semibold gap-1.5">
              <CreditCard className="w-4 h-4" />
              <span className="hidden sm:inline">Pagamento</span>
            </TabsTrigger>
            <TabsTrigger value="dados" className="rounded-full text-sm font-semibold gap-1.5">
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">Meus Dados</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pedidos" className="mt-6">
            {(() => {
              const deliveryOrders = orders.filter(o => o.delivery_type !== 'pickup');
              const pickupOrders = orders.filter(o => o.delivery_type === 'pickup');

              const renderOrder = (order: Order) => {
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
                        {order.status === 'aguardando_pagamento' && (
                          <>
                            {/* PIX válido — mostrar QR */}
                            {order.qr_code && order.qr_code_base64 && order.pix_expiration && new Date(order.pix_expiration) > new Date() && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenPixDialog(order)}
                              >
                                <QrCode className="w-4 h-4 mr-2" />
                                Ver QR Code PIX
                              </Button>
                            )}
                            {/* PIX expirado com tentativas restantes — regenerar */}
                            {order.qr_code && order.pix_expiration && new Date(order.pix_expiration) <= new Date() && ((order as any).pix_attempts || 0) < 3 && (
                              <div className="flex flex-col gap-2 items-end">
                                <span className="text-xs text-red-500 font-medium">🔴 PIX expirado</span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRefreshPix(order.id)}
                                  disabled={refreshingPix === order.id}
                                >
                                  {refreshingPix === order.id ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : (
                                    <QrCode className="w-4 h-4 mr-2" />
                                  )}
                                  Gerar novo PIX
                                </Button>
                              </div>
                            )}
                            {/* Cartão recusado com opções combinadas */}
                            {(order as any).payment_attempts > 0 && (
                              <div className="flex flex-col gap-2 items-end">
                                <span className="text-xs text-orange-500 font-medium">
                                  💳 Cartão recusado · {(order as any).payment_attempts} tentativa(s)
                                </span>
                                <div className="flex gap-2 flex-wrap justify-end">
                                  {(order as any).payment_attempts < PAYMENT_CONFIG.CARD_RETRY_MAX_ATTEMPTS && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setRetryCardOrderId(order.id)}
                                    >
                                      <CreditCard className="w-4 h-4 mr-2" />
                                      Tentar novamente
                                    </Button>
                                  )}
                                  {(order.qr_code || ((order as any).pix_attempts || 0) < 3) && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleRefreshPix(order.id)}
                                      disabled={refreshingPix === order.id}
                                    >
                                      {refreshingPix === order.id ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                      ) : (
                                        <QrCode className="w-4 h-4 mr-2" />
                                      )}
                                      {order.qr_code ? 'Ver QR Code PIX' : 'Pagar com PIX'}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )}
                            {/* Sem PIX e sem cartão recusado — gerar PIX se ainda pode */}
                            {!order.qr_code && (order as any).payment_attempts === 0 && ((order as any).pix_attempts || 0) < 3 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRefreshPix(order.id)}
                                disabled={refreshingPix === order.id}
                              >
                                {refreshingPix === order.id ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <QrCode className="w-4 h-4 mr-2" />
                                )}
                                Pagar com PIX
                              </Button>
                            )}
                            {/* Todas as formas esgotadas */}
                            {(order as any).payment_attempts >= PAYMENT_CONFIG.CARD_RETRY_MAX_ATTEMPTS && ((order as any).pix_attempts || 0) >= 3 && (
                              <span className="text-xs text-muted-foreground font-medium">
                                Número máximo de tentativas excedido
                              </span>
                            )}
                          </>
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

                    {/* Timeline visual de rastreamento */}
                    <OrderTrackingTimeline
                      status={order.status}
                      deliveryType={order.delivery_type}
                    />

                    <Separator />

                    <div className="space-y-2">
                      {order.order_items.map((item) => {
                        const isReviewed = reviewedProducts.has(`${order.id}_${item.product_id}`);
                        const canReview = (order.status === 'entregue' || order.status === 'entregado' || order.status === 'retirado') && !isReviewed;

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
                              toast.success('Código copiado!', { description: 'Cole no site da transportadora.' });
                            }}
                          >
                            <Copy className="w-3 h-3 mr-1" /> Copiar
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setTrackingDialog({ orderId: order.id, code: order.tracking_code! })}
                          >
                            <Truck className="w-3 h-3 mr-1" /> Rastrear pedido
                          </Button>
                        </div>
                      </div>
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
              };

              return (
                <Tabs defaultValue="entrega" className="w-full">
                  <TabsList className="w-full grid grid-cols-2 h-11 rounded-full p-1 mb-4">
                    <TabsTrigger value="entrega" className="rounded-full text-sm font-semibold gap-1.5">
                      <Truck className="w-4 h-4" />
                      Entrega
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                        {deliveryOrders.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="retirada" className="rounded-full text-sm font-semibold gap-1.5">
                      <Store className="w-4 h-4" />
                      Retirada
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                        {pickupOrders.length}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="entrega">
                    <Card className="rounded-2xl border-border">
                      <CardContent className="p-6 space-y-6">
                        {deliveryOrders.length === 0 ? (
                          <p className="text-muted-foreground text-center py-8">
                            Você ainda não fez nenhum pedido para entrega
                          </p>
                        ) : (
                          deliveryOrders.map(renderOrder)
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="retirada">
                    <Card className="rounded-2xl border-border">
                      <CardContent className="p-6 space-y-6">
                        {pickupOrders.length === 0 ? (
                          <p className="text-muted-foreground text-center py-8">
                            Você ainda não fez nenhum pedido para retirada
                          </p>
                        ) : (
                          pickupOrders.map(renderOrder)
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              );
            })()}
          </TabsContent>

          <TabsContent value="enderecos" className="mt-6">
            <Card className="rounded-2xl border-border">
              <CardContent className="p-6">
                <MyAddresses />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pagamento" className="mt-6">
            <Card className="rounded-2xl border-border">
              <CardContent className="p-6">
                <MyPaymentMethods />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dados" className="mt-6 space-y-4">
            <Card className="rounded-2xl border-border">
              <CardContent className="p-6">
                <MyProfile />
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Download className="w-4 h-4" /> Baixar minhas informações</CardTitle>
                <CardDescription>Receba um arquivo com todos os dados que temos sobre você.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleExportData} disabled={exporting} variant="outline" size="sm">
                  {exporting ? "Preparando arquivo..." : "Baixar meus dados"}
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Mail className="w-4 h-4" /> Falar com o responsável pelos dados</CardTitle>
                <CardDescription>Roberto Baba — robertobaba2@gmail.com</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" asChild>
                  <a href="mailto:robertobaba2@gmail.com?subject=Solicita%C3%A7%C3%A3o%20LGPD">Enviar e-mail</a>
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-destructive/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-destructive"><Trash2 className="w-4 h-4" /> Solicitar exclusão da conta</CardTitle>
                <CardDescription>
                  Sua conta e dados pessoais serão removidos. Dados fiscais são retidos por 5 anos (exigência legal).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">Solicitar exclusão</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirmar solicitação de exclusão?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Será aberto um e-mail para nosso Encarregado processar sua solicitação em até 15 dias úteis, conforme a LGPD.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteRequest}>Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
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
          gateway={selectedPixPayment.gateway}
          onRefreshPix={() => handleRefreshPix(selectedPixPayment.orderId)}
        />
      )}

      {/* Diálogo de retentativa de cartão */}
      {retryCardOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !retryLoading && setRetryCardOrderId(null)}>
          <div className="bg-card rounded-xl border p-6 max-w-lg mx-4 shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-4">Tentar novamente com outro cartão</h3>
            <CreditCardForm
              totalAmount={orders.find(o => o.id === retryCardOrderId)?.total_amount || 0}
              onCardData={setRetryCardData}
              onInstallmentChange={() => {}}
              loading={retryLoading}
              error={undefined}
            />
            <div className="flex gap-2 mt-4 justify-end">
              <Button variant="outline" onClick={() => setRetryCardOrderId(null)} disabled={retryLoading}>
                Cancelar
              </Button>
              <Button onClick={handleRetryCard} disabled={retryLoading || !retryCardData}>
                {retryLoading ? 'Processando...' : 'Tentar pagar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {pickupQROrderId && (
        <PickupQRDialog
          open={!!pickupQROrderId}
          onOpenChange={(open) => !open && setPickupQROrderId(null)}
          orderId={pickupQROrderId}
        />
      )}

      {trackingDialog && (
        <OrderTrackingDialog
          open={!!trackingDialog}
          onOpenChange={(open) => !open && setTrackingDialog(null)}
          orderId={trackingDialog.orderId}
          trackingCode={trackingDialog.code}
        />
      )}
    </div>
  );
}