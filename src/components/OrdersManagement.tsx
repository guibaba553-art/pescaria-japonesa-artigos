import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Package, Truck, CheckCircle, Trash2, ChevronDown, ChevronRight, Clock, PackageCheck, Store } from 'lucide-react';
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

interface OrderItem {
  id: string;
  quantity: number;
  price_at_purchase: number;
  products: {
    name: string;
  };
}

interface Order {
  id: string;
  total_amount: number;
  shipping_cost: number;
  status: 'aguardando_pagamento' | 'em_preparo' | 'enviado' | 'entregado';
  created_at: string;
  user_id: string;
  shipping_cep: string;
  delivery_type: 'delivery' | 'pickup';
  order_items: OrderItem[];
}

interface Profile {
  full_name: string;
  cpf: string | null;
}

const statusConfig = {
  aguardando_pagamento: { label: 'Aguardando Pagamento', icon: Clock, color: 'bg-orange-500' },
  em_preparo: { label: 'Em Preparo', icon: Package, color: 'bg-yellow-500' },
  enviado: { label: 'Enviado', icon: Truck, color: 'bg-blue-500' },
  entregado: { label: 'Entregue', icon: CheckCircle, color: 'bg-green-500' }
};

const OrdersTable = ({ 
  orders, 
  profiles, 
  expandedOrders, 
  toggleOrderExpansion,
  updateOrderStatus,
  deleteOrder 
}: {
  orders: Order[];
  profiles: Record<string, { name: string; cpf: string }>;
  expandedOrders: Set<string>;
  toggleOrderExpansion: (orderId: string) => void;
  updateOrderStatus: (orderId: string, newStatus: 'aguardando_pagamento' | 'em_preparo' | 'enviado' | 'entregado') => void;
  deleteOrder: (orderId: string) => void;
}) => {
  if (orders.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Nenhum pedido nesta categoria</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>CPF</TableHead>
          <TableHead>CEP</TableHead>
          <TableHead>Itens</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Data</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => {
          const isExpanded = expandedOrders.has(order.id);
          return (
            <Collapsible key={order.id} open={isExpanded} onOpenChange={() => toggleOrderExpansion(order.id)}>
              <TableRow>
                <TableCell className="font-mono text-xs">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 mr-1" />
                      ) : (
                        <ChevronRight className="h-4 w-4 mr-1" />
                      )}
                      <span>{order.id.slice(0, 8)}</span>
                    </Button>
                  </CollapsibleTrigger>
                </TableCell>
                <TableCell>{profiles[order.user_id]?.name || 'Carregando...'}</TableCell>
                <TableCell className="font-mono text-sm">
                  {profiles[order.user_id]?.cpf || 'N/A'}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {order.shipping_cep || 'N/A'}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {order.order_items.length} {order.order_items.length === 1 ? 'item' : 'itens'}
                  </Badge>
                </TableCell>
                <TableCell>R$ {order.total_amount.toFixed(2)}</TableCell>
                <TableCell>
                  {new Date(order.created_at).toLocaleDateString('pt-BR')}
                </TableCell>
                <TableCell>
                  <Select
                    value={order.status}
                    onValueChange={(value) => updateOrderStatus(order.id, value as 'aguardando_pagamento' | 'em_preparo' | 'enviado' | 'entregado')}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aguardando_pagamento">Aguardando Pagamento</SelectItem>
                      <SelectItem value="em_preparo">Em Preparo</SelectItem>
                      <SelectItem value="enviado">Enviado</SelectItem>
                      <SelectItem value="entregue">Entregue</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja excluir este pedido? Esta ação não pode ser desfeita.
                          <div className="mt-2 p-2 bg-muted rounded-md text-sm">
                            <strong>Pedido:</strong> {order.id.slice(0, 8)}...<br />
                            <strong>Cliente:</strong> {profiles[order.user_id]?.name}<br />
                            <strong>Total:</strong> R$ {order.total_amount.toFixed(2)}
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteOrder(order.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
              <CollapsibleContent asChild>
                <TableRow>
                  <TableCell colSpan={9} className="bg-muted/50">
                    <div className="py-4 px-6 grid grid-cols-2 gap-6">
                      {/* Informações do Cliente */}
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm border-b pb-2">Informações do Cliente</h4>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase">Cliente</p>
                            <p className="font-medium">{profiles[order.user_id]?.name || 'Carregando...'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase">CPF</p>
                            <p className="font-mono">{profiles[order.user_id]?.cpf || 'N/A'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase">CEP</p>
                            <p className="font-mono">{order.shipping_cep || 'N/A'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Itens do Pedido */}
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm border-b pb-2">Itens do Pedido</h4>
                        <div className="space-y-2">
                          {order.order_items.map((item) => (
                            <div 
                              key={item.id}
                              className="flex items-center justify-between p-3 bg-background rounded-lg border"
                            >
                              <div className="flex-1">
                                <p className="font-medium">{item.products.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  Quantidade: {item.quantity} × R$ {item.price_at_purchase.toFixed(2)}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold">
                                  R$ {(item.quantity * item.price_at_purchase).toFixed(2)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="pt-3 border-t space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>Subtotal:</span>
                            <span>R$ {(order.total_amount - order.shipping_cost).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Frete:</span>
                            <span>R$ {order.shipping_cost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-base pt-2 border-t">
                            <span>Total:</span>
                            <span>R$ {order.total_amount.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </TableBody>
    </Table>
  );
};

export function OrdersManagement() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; cpf: string }>>({});
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
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
          loadOrders(); // Recarregar pedidos quando houver mudanças
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadOrders = async () => {
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          products (name)
        )
      `)
      .order('created_at', { ascending: false });

    if (ordersError) {
      toast({
        title: 'Erro ao carregar pedidos',
        description: ordersError.message,
        variant: 'destructive'
      });
      setLoading(false);
      return;
    }

    // Buscar perfis dos usuários
    const userIds = [...new Set(ordersData?.map(o => o.user_id) || [])];
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, cpf')
      .in('id', userIds);

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
  };

  const updateOrderStatus = async (orderId: string, newStatus: 'aguardando_pagamento' | 'em_preparo' | 'enviado' | 'entregado') => {
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
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
      loadOrders();
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

  if (loading) {
    return <div>Carregando pedidos...</div>;
  }

  // Filtrar pedidos por status e tipo de entrega
  const semPagamento = orders.filter(o => o.status === 'aguardando_pagamento');
  const paraEnviar = orders.filter(o => o.status === 'em_preparo' && o.delivery_type === 'delivery');
  const paraRetirar = orders.filter(o => o.status === 'em_preparo' && o.delivery_type === 'pickup');
  const emCaminho = orders.filter(o => o.status === 'enviado');
  const entregues = orders.filter(o => o.status === 'entregado');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestão de Pedidos ({orders.length})</CardTitle>
        <CardDescription>Organize e gerencie os pedidos por status</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="sem-pagamento" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="sem-pagamento" className="relative">
              <Clock className="w-4 h-4 mr-2" />
              Sem Pagamento
              {semPagamento.length > 0 && (
                <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">
                  {semPagamento.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="para-enviar" className="relative">
              <Package className="w-4 h-4 mr-2" />
              Para Enviar
              {paraEnviar.length > 0 && (
                <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">
                  {paraEnviar.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="para-retirar" className="relative">
              <Store className="w-4 h-4 mr-2" />
              Para Retirar
              {paraRetirar.length > 0 && (
                <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">
                  {paraRetirar.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="em-caminho" className="relative">
              <Truck className="w-4 h-4 mr-2" />
              Em Caminho
              {emCaminho.length > 0 && (
                <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">
                  {emCaminho.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="entregues" className="relative">
              <PackageCheck className="w-4 h-4 mr-2" />
              Entregues
              {entregues.length > 0 && (
                <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">
                  {entregues.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sem-pagamento">
            <OrdersTable
              orders={semPagamento}
              profiles={profiles}
              expandedOrders={expandedOrders}
              toggleOrderExpansion={toggleOrderExpansion}
              updateOrderStatus={updateOrderStatus}
              deleteOrder={deleteOrder}
            />
          </TabsContent>

          <TabsContent value="para-enviar">
            <OrdersTable
              orders={paraEnviar}
              profiles={profiles}
              expandedOrders={expandedOrders}
              toggleOrderExpansion={toggleOrderExpansion}
              updateOrderStatus={updateOrderStatus}
              deleteOrder={deleteOrder}
            />
          </TabsContent>

          <TabsContent value="para-retirar">
            <OrdersTable
              orders={paraRetirar}
              profiles={profiles}
              expandedOrders={expandedOrders}
              toggleOrderExpansion={toggleOrderExpansion}
              updateOrderStatus={updateOrderStatus}
              deleteOrder={deleteOrder}
            />
          </TabsContent>

          <TabsContent value="em-caminho">
            <OrdersTable
              orders={emCaminho}
              profiles={profiles}
              expandedOrders={expandedOrders}
              toggleOrderExpansion={toggleOrderExpansion}
              updateOrderStatus={updateOrderStatus}
              deleteOrder={deleteOrder}
            />
          </TabsContent>

          <TabsContent value="entregues">
            <OrdersTable
              orders={entregues}
              profiles={profiles}
              expandedOrders={expandedOrders}
              toggleOrderExpansion={toggleOrderExpansion}
              updateOrderStatus={updateOrderStatus}
              deleteOrder={deleteOrder}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}