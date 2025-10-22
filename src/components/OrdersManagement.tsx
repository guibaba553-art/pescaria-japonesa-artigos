import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Package, Truck, CheckCircle } from 'lucide-react';

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
  order_items: OrderItem[];
}

interface Profile {
  full_name: string;
  cpf: string | null;
}

const statusConfig = {
  aguardando_pagamento: { label: 'Aguardando Pagamento', icon: Package, color: 'bg-orange-500' },
  em_preparo: { label: 'Em Preparo', icon: Package, color: 'bg-yellow-500' },
  enviado: { label: 'Enviado', icon: Truck, color: 'bg-blue-500' },
  entregado: { label: 'Entregue', icon: CheckCircle, color: 'bg-green-500' }
};

export function OrdersManagement() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; cpf: string }>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadOrders();
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
    setOrders(ordersData || []);
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

  if (loading) {
    return <div>Carregando pedidos...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pedidos ({orders.length})</CardTitle>
        <CardDescription>Gerencie os pedidos dos clientes</CardDescription>
      </CardHeader>
      <CardContent>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-mono text-xs">
                  {order.id.slice(0, 8)}
                </TableCell>
                <TableCell>{profiles[order.user_id]?.name || 'Carregando...'}</TableCell>
                <TableCell className="font-mono text-sm">
                  {profiles[order.user_id]?.cpf || 'N/A'}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {order.shipping_cep || 'N/A'}
                </TableCell>
                <TableCell>
                  <div className="space-y-1 text-sm">
                    {order.order_items.map((item) => (
                      <div key={item.id}>
                        {item.products.name} x{item.quantity}
                      </div>
                    ))}
                  </div>
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
                      <SelectItem value="entregado">Entregue</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}