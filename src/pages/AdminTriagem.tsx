import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AdminPageLayout } from '@/components/admin/AdminPageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ScanBarcode,
  Package,
  Truck,
  Store,
  RefreshCw,
  Search,
  User,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { TriagemScanDialog, TriagemOrder } from '@/components/TriagemScanDialog';

export default function AdminTriagem() {
  const navigate = useNavigate();
  const { isEmployee, isAdmin, permissions, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const canView = isAdmin || (isEmployee && permissions.triagem);

  const [orders, setOrders] = useState<TriagemOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'pickup' | 'pack'>('pickup');
  const [selectedOrder, setSelectedOrder] = useState<TriagemOrder | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !canView) navigate('/admin');
  }, [authLoading, canView, navigate]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from('orders')
        .select(
          `id, total_amount, shipping_cost, shipping_address, shipping_cep, status, delivery_type, source, created_at, user_id, tracking_code,
           order_items(id, quantity, price_at_purchase, product_id, variation_id, products(name, image_url, sku), product_variations(name, sku)),
           nfe_emissions(id, nfe_number, danfe_url, status)`,
        )
        .eq('source', 'site')
        .in('status', ['em_preparo', 'aguardando_envio'])
        .order('created_at', { ascending: true });

      if (error) throw error;

      const list = (rows || []) as any[];
      const userIds = Array.from(new Set(list.map((o) => o.user_id).filter(Boolean)));
      let profilesMap: Record<string, any> = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone, cpf')
          .in('id', userIds);
        (profiles || []).forEach((p: any) => (profilesMap[p.id] = p));
      }

      const enriched: TriagemOrder[] = list.map((o) => {
        const nfes = (o.nfe_emissions || []) as any[];
        // Pick latest authorized or latest
        const authorized = nfes.find(
          (n) => n.status === 'autorizada' || n.status === 'authorized',
        );
        const nfe = authorized || nfes[0] || null;
        return {
          ...o,
          profile: profilesMap[o.user_id] || null,
          nfe: nfe
            ? {
                id: nfe.id,
                nfe_number: nfe.nfe_number,
                danfe_url: nfe.danfe_url,
                status: nfe.status,
              }
            : null,
        };
      });

      setOrders(enriched);
    } catch (err: any) {
      console.error('[AdminTriagem] load error:', err);
      toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isEmployee || isAdmin) loadOrders();
  }, [isEmployee, isAdmin, loadOrders]);

  const filterByQuery = (list: TriagemOrder[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.profile?.full_name?.toLowerCase().includes(q) ||
        o.profile?.cpf?.includes(q) ||
        o.profile?.phone?.includes(q),
    );
  };

  const pickupOrders = filterByQuery(
    orders.filter((o) => o.delivery_type === 'pickup' && o.status === 'em_preparo'),
  );
  const packOrders = filterByQuery(
    orders.filter((o) => o.delivery_type === 'delivery' && o.status === 'em_preparo'),
  );

  const openScanFor = (order: TriagemOrder) => {
    setSelectedOrder(order);
    setScanOpen(true);
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }
  if (!isEmployee && !isAdmin) return null;

  return (
    <AdminPageLayout
      icon={ScanBarcode}
      eyebrow="Triagem"
      title="Triagem de Pedidos"
      description="Confirme retiradas e embale envios escaneando o código de barras de cada item."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={loadOrders}
          className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground"
        >
          <RefreshCw className="w-4 h-4 mr-1.5" /> Atualizar
        </Button>
      }
    >
      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ID, nome, CPF ou telefone..."
            className="pl-9"
          />
        </div>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'pickup' | 'pack')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pickup" className="gap-2">
            <Store className="w-4 h-4" />
            Para Retirar
            <Badge variant="secondary" className="ml-1">
              {pickupOrders.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="pack" className="gap-2">
            <Package className="w-4 h-4" />
            Para Embalar
            <Badge variant="secondary" className="ml-1">
              {packOrders.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pickup" className="space-y-3 mt-4">
          <OrdersList
            orders={pickupOrders}
            loading={loading}
            mode="pickup"
            onOpen={openScanFor}
          />
        </TabsContent>

        <TabsContent value="pack" className="space-y-3 mt-4">
          <OrdersList
            orders={packOrders}
            loading={loading}
            mode="pack"
            onOpen={openScanFor}
          />
        </TabsContent>
      </Tabs>

      <TriagemScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        order={selectedOrder}
        mode={tab}
        onCompleted={loadOrders}
      />
    </AdminPageLayout>
  );
}

interface ListProps {
  orders: TriagemOrder[];
  loading: boolean;
  mode: 'pickup' | 'pack';
  onOpen: (o: TriagemOrder) => void;
}

function OrdersList({ orders, loading, mode, onOpen }: ListProps) {
  if (loading) {
    return (
      <Card className="p-10 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (orders.length === 0) {
    return (
      <Card className="p-10 text-center text-muted-foreground">
        {mode === 'pickup' ? (
          <Store className="w-10 h-10 mx-auto mb-2 opacity-40" />
        ) : (
          <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
        )}
        <p className="text-sm">
          {mode === 'pickup'
            ? 'Nenhum pedido aguardando retirada.'
            : 'Nenhum pedido para embalar agora.'}
        </p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {orders.map((o) => {
        const totalUnits = o.order_items.reduce((s, it) => s + it.quantity, 0);
        return (
          <button
            key={o.id}
            onClick={() => onOpen(o)}
            className={`group text-left bg-card border-2 rounded-2xl p-4 hover:shadow-md transition-all ${
              mode === 'pickup'
                ? 'border-l-4 border-l-emerald-500 hover:border-emerald-500/40'
                : 'border-l-4 border-l-blue-500 hover:border-blue-500/40'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">#{o.id.slice(0, 8)}</span>
                  {mode === 'pickup' ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                      <Store className="w-3 h-3 mr-1" /> Retirada
                    </Badge>
                  ) : (
                    <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30">
                      <Truck className="w-3 h-3 mr-1" /> Envio
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-sm text-foreground/80 mt-1.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="truncate">{o.profile?.full_name || 'Sem nome'}</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {o.order_items.length} item(ns) · {totalUnits} unidade(s)
              </span>
              <span className="font-bold text-foreground">
                {o.total_amount.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {new Date(o.created_at).toLocaleString('pt-BR')}
            </div>
          </button>
        );
      })}
    </div>
  );
}
