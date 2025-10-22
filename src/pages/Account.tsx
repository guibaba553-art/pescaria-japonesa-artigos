import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Package, Truck, CheckCircle, Home, Star } from 'lucide-react';
import { ReviewDialog } from '@/components/ReviewDialog';

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

interface Order {
  id: string;
  total_amount: number;
  shipping_cost: number;
  shipping_address: string;
  status: 'aguardando_pagamento' | 'em_preparo' | 'enviado' | 'entregado';
  created_at: string;
  order_items: OrderItem[];
}

const statusConfig = {
  aguardando_pagamento: { label: 'Aguardando Pagamento', icon: Package, color: 'bg-orange-500' },
  em_preparo: { label: 'Em Preparo', icon: Package, color: 'bg-yellow-500' },
  enviado: { label: 'Enviado', icon: Truck, color: 'bg-blue-500' },
  entregado: { label: 'Entregue', icon: CheckCircle, color: 'bg-green-500' }
};

export default function Account() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<{
    orderId: string;
    productId: string;
    productName: string;
  } | null>(null);
  const [reviewedProducts, setReviewedProducts] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      loadOrders();
    }
  }, [user]);

  const loadOrders = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          products (name, image_url)
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Header />
      <div className="max-w-4xl mx-auto p-6 pt-24 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Minha Conta</h1>
          <Button variant="outline" onClick={() => navigate('/')}>
            <Home className="w-4 h-4 mr-2" />
            Voltar à Home
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Meus Pedidos</CardTitle>
            <CardDescription>
              Acompanhe o status dos seus pedidos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {orders.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Você ainda não fez nenhum pedido
              </p>
            ) : (
              orders.map((order) => {
                const StatusIcon = statusConfig[order.status].icon;
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
                      <Badge className={statusConfig[order.status].color}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {statusConfig[order.status].label}
                      </Badge>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      {order.order_items.map((item) => {
                        const isReviewed = reviewedProducts.has(`${order.id}_${item.product_id}`);
                        const canReview = order.status === 'entregado' && !isReviewed;
                        
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
    </div>
  );
}