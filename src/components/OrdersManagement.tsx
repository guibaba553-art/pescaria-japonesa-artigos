import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Package, Truck, CheckCircle, Trash2, ChevronDown, ChevronRight, Clock, PackageCheck, Store, RefreshCw } from 'lucide-react';
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
  status: 'aguardando_pagamento' | 'em_preparo' | 'enviado' | 'entregado';
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
} as const;

// Etiqueta de status considerando o tipo de entrega (retirada na loja => "Pronto para Retirar")
const getStatusLabel = (status: Order['status'], deliveryType: Order['delivery_type']): string => {
  if (status === 'em_preparo' && deliveryType === 'pickup') return 'Pronto para Retirar';
  return statusConfig[status].label;
};

const getNextStatus = (currentStatus: Order['status'], deliveryType: Order['delivery_type']): Order['status'] | null => {
  if (currentStatus === 'aguardando_pagamento') return 'em_preparo';
  if (currentStatus === 'em_preparo') {
    return deliveryType === 'pickup' ? 'entregado' : 'enviado';
  }
  if (currentStatus === 'enviado') return 'entregado';
  return null; // Já está entregue
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
  updateTrackingCode
}: {
  orders: Order[];
  profiles: Record<string, { name: string; cpf: string }>;
  expandedOrders: Set<string>;
  toggleOrderExpansion: (orderId: string) => void;
  updateOrderStatus: (orderId: string, newStatus: 'aguardando_pagamento' | 'em_preparo' | 'enviado' | 'entregado') => void;
  deleteOrder: (orderId: string) => void;
  verifyPayment: (orderId: string) => void;
  trackingCodes: Record<string, string>;
  setTrackingCodes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  updateTrackingCode: (orderId: string) => void;
}) => {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground rounded-xl border border-dashed bg-muted/30">
        <Package className="w-14 h-14 mb-3 opacity-40" />
        <p className="text-sm font-medium">Nenhum pedido nesta categoria</p>
        <p className="text-xs opacity-70 mt-1">Os pedidos aparecerão aqui assim que forem criados</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {orders.map((order) => {
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
                          {nfe.error_message && (
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
      })}
    </div>
  );
};

export function OrdersManagement() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; cpf: string }>>({});
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [trackingCodes, setTrackingCodes] = useState<Record<string, string>>({});
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

    // Log audit trail for admin accessing user profiles (PII data)
    if (profilesData && profilesData.length > 0) {
      for (const profile of profilesData) {
        const { error: logError } = await supabase.rpc('log_admin_access', {
          p_action: 'VIEW_PROFILE',
          p_table_name: 'profiles',
          p_record_id: profile.id,
          p_accessed_user_id: profile.id,
          p_details: { 
            context: 'orders_management',
            timestamp: new Date().toISOString(),
            accessed_fields: ['full_name', 'cpf']
          }
        });
        
        if (logError) {
          console.error('Failed to log profile access:', logError);
        }
      }
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
    entregues: siteOrders.filter(o => o.status === 'entregado'),
  };

  const pdv = {
    semPagamento: pdvOrders.filter(o => o.status === 'aguardando_pagamento'),
    prontoRetirar: pdvOrders.filter(o => o.status === 'em_preparo'),
    finalizadas: pdvOrders.filter(o => o.status === 'entregado'),
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
  };

  const renderSiteTabs = () => (
    <Tabs defaultValue="sem-pagamento" className="space-y-4">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="sem-pagamento">
          <Clock className="w-4 h-4 mr-2" />
          Sem Pagamento
          {site.semPagamento.length > 0 && (
            <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.semPagamento.length}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="para-enviar">
          <Package className="w-4 h-4 mr-2" />
          Para Enviar
          {site.paraEnviar.length > 0 && (
            <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.paraEnviar.length}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="pronto-retirar">
          <Store className="w-4 h-4 mr-2" />
          Pronto p/ Retirar
          {site.prontoRetirar.length > 0 && (
            <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.prontoRetirar.length}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="em-caminho">
          <Truck className="w-4 h-4 mr-2" />
          Em Caminho
          {site.emCaminho.length > 0 && (
            <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.emCaminho.length}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="entregues">
          <PackageCheck className="w-4 h-4 mr-2" />
          Entregues
          {site.entregues.length > 0 && (
            <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.entregues.length}</Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="sem-pagamento"><OrdersTable orders={site.semPagamento} {...tableProps} /></TabsContent>
      <TabsContent value="para-enviar"><OrdersTable orders={site.paraEnviar} {...tableProps} /></TabsContent>
      <TabsContent value="pronto-retirar"><OrdersTable orders={site.prontoRetirar} {...tableProps} /></TabsContent>
      <TabsContent value="em-caminho"><OrdersTable orders={site.emCaminho} {...tableProps} /></TabsContent>
      <TabsContent value="entregues"><OrdersTable orders={site.entregues} {...tableProps} /></TabsContent>
    </Tabs>
  );

  const renderPdvTabs = () => (
    <Tabs defaultValue="finalizadas" className="space-y-4">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="sem-pagamento">
          <Clock className="w-4 h-4 mr-2" />
          Sem Pagamento
          {pdv.semPagamento.length > 0 && (
            <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{pdv.semPagamento.length}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="pronto-retirar">
          <Store className="w-4 h-4 mr-2" />
          Pronto p/ Retirar
          {pdv.prontoRetirar.length > 0 && (
            <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{pdv.prontoRetirar.length}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="finalizadas">
          <PackageCheck className="w-4 h-4 mr-2" />
          Finalizadas
          {pdv.finalizadas.length > 0 && (
            <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{pdv.finalizadas.length}</Badge>
          )}
        </TabsTrigger>
      </TabsList>

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
        <div className="p-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Gestão de Pedidos</h2>
                <p className="text-sm text-muted-foreground">Pedidos do site e vendas do PDV organizados por status</p>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="px-4 py-2 rounded-lg bg-background/80 backdrop-blur border">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Total</p>
              <p className="text-xl font-bold">{orders.length}</p>
            </div>
            <div className="px-4 py-2 rounded-lg bg-background/80 backdrop-blur border">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Pendentes</p>
              <p className="text-xl font-bold text-orange-500">{pendingCount}</p>
            </div>
            <div className="px-4 py-2 rounded-lg bg-background/80 backdrop-blur border">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Receita</p>
              <p className="text-xl font-bold text-primary">R$ {totalRevenue.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      <CardContent className="p-4 md:p-6">
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
    </Card>
  );
}
