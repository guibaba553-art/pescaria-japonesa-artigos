import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft, 
  Package, 
  Calendar,
  DollarSign,
  User,
  MapPin,
  CreditCard,
  FolderOpen,
  ShoppingBag
} from 'lucide-react';
import { Header } from '@/components/Header';

export default function SalesHistory() {
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();
  const { toast } = useToast();
  
  const [orders, setOrders] = useState<any[]>([]);
  const [savedSales, setSavedSales] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(true);

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/auth');
    }
  }, [user, isAdmin, loading, navigate]);

  useEffect(() => {
    loadOrders();
    loadSavedSales();
  }, []);

  const loadOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          items:order_items(
            *,
            product:products(*)
          ),
          customer:customers(*)
        `)
        .eq('delivery_type', 'pickup')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar pedidos',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadSavedSales = async () => {
    try {
      const { data, error } = await supabase
        .from('saved_sales')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSavedSales(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar vendas salvas',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoadingSaved(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } } = {
      'aguardando_pagamento': { label: 'Aguardando', variant: 'outline' },
      'em_preparo': { label: 'Em Preparo', variant: 'secondary' },
      'enviado': { label: 'Enviado', variant: 'default' },
      'entregado': { label: 'Entregue', variant: 'default' }
    };
    
    const statusInfo = statusMap[status] || { label: status, variant: 'outline' };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  if (loading || loadingOrders) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Header />
      
      <div className="container mx-auto p-6 pt-24">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShoppingBag className="w-8 h-8" />
            Histórico de Vendas
          </h1>
          <Button variant="outline" onClick={() => navigate('/pdv')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao PDV
          </Button>
        </div>

        <Tabs defaultValue="finalized" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="finalized">
              <Package className="w-4 h-4 mr-2" />
              Vendas Finalizadas
              <Badge variant="secondary" className="ml-2">{orders.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="saved">
              <FolderOpen className="w-4 h-4 mr-2" />
              Vendas Salvas
              <Badge variant="secondary" className="ml-2">{savedSales.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="finalized">
            <ScrollArea className="h-[calc(100vh-250px)]">
              {orders.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma venda finalizada</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <Card key={order.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">
                              Pedido #{order.id.slice(0, 8)}
                            </CardTitle>
                            <div className="flex items-center gap-2 mt-2">
                              {getStatusBadge(order.status)}
                              <Badge variant="outline" className="text-xs">
                                <Calendar className="w-3 h-3 mr-1" />
                                {new Date(order.created_at).toLocaleString('pt-BR')}
                              </Badge>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-primary">
                              R$ {order.total_amount.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Cliente */}
                        {order.customer && (
                          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                            <User className="w-4 h-4 mt-1 text-muted-foreground" />
                            <div className="flex-1">
                              <p className="font-semibold">{order.customer.full_name}</p>
                              <p className="text-sm text-muted-foreground">CPF: {order.customer.cpf}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                <MapPin className="w-3 h-3" />
                                {order.customer.street}, {order.customer.number} - {order.customer.neighborhood}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Produtos */}
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            Produtos
                          </h4>
                          <div className="space-y-2">
                            {order.items.map((item: any) => (
                              <div key={item.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{item.product.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.quantity}x R$ {item.price_at_purchase.toFixed(2)}
                                  </p>
                                </div>
                                <p className="font-semibold">
                                  R$ {(item.quantity * item.price_at_purchase).toFixed(2)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="saved">
            <ScrollArea className="h-[calc(100vh-250px)]">
              {savedSales.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12 text-muted-foreground">
                    <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma venda salva</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {savedSales.map((sale) => (
                    <Card key={sale.id} className="cursor-pointer hover:shadow-lg transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-semibold text-lg">
                              Venda #{sale.id.slice(0, 8)}
                            </h3>
                            <Badge variant="outline" className="text-xs mt-1">
                              <Calendar className="w-3 h-3 mr-1" />
                              {new Date(sale.created_at).toLocaleString('pt-BR')}
                            </Badge>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-primary">
                              R$ {sale.total_amount.toFixed(2)}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            <span>{(sale.cart_data as any[]).length} produto(s)</span>
                          </div>

                          {sale.customer_data && (
                            <div className="flex items-start gap-2">
                              <User className="w-4 h-4 mt-0.5" />
                              <div>
                                <p className="font-medium">{(sale.customer_data as any).full_name}</p>
                                <p className="text-xs">CPF: {(sale.customer_data as any).cpf}</p>
                              </div>
                            </div>
                          )}

                          {sale.payment_method && (
                            <div className="flex items-center gap-2">
                              <CreditCard className="w-4 h-4" />
                              <span>
                                {sale.payment_method === 'cash' ? 'Dinheiro' :
                                 sale.payment_method === 'credit' ? 'Crédito' :
                                 sale.payment_method === 'debit' ? 'Débito' :
                                 sale.payment_method === 'pix' ? 'PIX' : 'N/A'}
                              </span>
                            </div>
                          )}
                        </div>

                        <Button 
                          className="w-full mt-4"
                          onClick={() => navigate('/pdv')}
                        >
                          <FolderOpen className="w-4 h-4 mr-2" />
                          Abrir no PDV
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
