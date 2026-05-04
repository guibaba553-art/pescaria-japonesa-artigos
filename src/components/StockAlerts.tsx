import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, PackageX, Package2, Loader2, ShoppingBasket, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AddToPurchaseListDialog } from './AddToPurchaseListDialog';
import { PurchaseLists } from './PurchaseLists';

interface AlertProduct {
  id: string;
  name: string;
  stock: number;
  min_stock: number;
  category: string;
  image_url: string | null;
}

export function StockAlerts() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<AlertProduct[]>([]);
  const [dialog, setDialog] = useState<AlertProduct | null>(null);

  const load = async () => {
    const [prodsRes, listItemsRes, dismissedRes] = await Promise.all([
      supabase.rpc('get_products_admin'),
      supabase.from('purchase_list_items').select('product_id'),
      supabase.from('dismissed_stock_alerts').select('product_id'),
    ]);

    const inListIds = new Set((listItemsRes.data ?? []).map((i: any) => i.product_id));
    const dismissedIds = new Set((dismissedRes.data ?? []).map((i: any) => i.product_id));

    if (prodsRes.data) {
      const filtered = (prodsRes.data as any[])
        .filter((p) => p.category !== 'Pendente Revisão')
        .filter((p) => p.stock === 0 || (p.min_stock > 0 && p.stock <= p.min_stock))
        .filter((p) => !inListIds.has(p.id)) // oculta produtos já em alguma lista
        .filter((p) => !dismissedIds.has(p.id)) // oculta produtos dispensados
        .sort((a, b) => a.stock - b.stock)
        .map((p) => ({
          id: p.id,
          name: p.name,
          stock: p.stock,
          min_stock: p.min_stock,
          category: p.category,
          image_url: p.image_url,
        })) as AlertProduct[];
      setProducts(filtered);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Recarrega quando itens de lista são adicionados/removidos em qualquer lugar
    const channel = supabase
      .channel('purchase_list_items_alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_list_items' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const outOfStock = products.filter((p) => p.stock === 0);
  const lowStock = products.filter((p) => p.stock > 0);

  return (
    <Tabs defaultValue="alerts" className="space-y-4">
      <TabsList>
        <TabsTrigger value="alerts" className="gap-2">
          <AlertTriangle className="w-4 h-4" /> Alertas de estoque
        </TabsTrigger>
        <TabsTrigger value="purchase-lists" className="gap-2">
          <ShoppingBasket className="w-4 h-4" /> Lista de compras
        </TabsTrigger>
      </TabsList>

      <TabsContent value="alerts" className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-destructive font-bold">Esgotados</span>
                    <PackageX className="w-4 h-4 text-destructive" />
                  </div>
                  <div className="text-2xl font-display font-black text-destructive mt-1">{outOfStock.length}</div>
                </CardContent>
              </Card>
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold">Estoque baixo</span>
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="text-2xl font-display font-black text-amber-600 dark:text-amber-400 mt-1">{lowStock.length}</div>
                </CardContent>
              </Card>
            </div>

            {products.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Package2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Nenhum produto com alerta de estoque 🎉</p>
                  <p className="text-xs mt-1">Configure o estoque mínimo nos produtos para receber alertas.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {products.map((p) => {
                  const isOut = p.stock === 0;
                  return (
                    <Card
                      key={p.id}
                      className={`transition-colors ${isOut ? 'border-destructive/40' : 'border-amber-500/40'}`}
                    >
                      <CardContent className="p-3 flex items-center gap-3">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-12 h-12 rounded object-cover bg-muted" />
                        ) : (
                          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                            <Package2 className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.category}</div>
                        </div>
                        <div className="text-right space-y-1">
                          {isOut ? (
                            <Badge variant="destructive" className="text-[10px]">ESGOTADO</Badge>
                          ) : (
                            <Badge className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20">
                              {p.stock} / mín {p.min_stock}
                            </Badge>
                          )}
                        </div>
                        <Button size="sm" onClick={() => setDialog(p)} className="shrink-0 gap-1">
                          <ShoppingBasket className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Adicionar à lista</span>
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </TabsContent>

      <TabsContent value="purchase-lists">
        <PurchaseLists />
      </TabsContent>

      {dialog && (
        <AddToPurchaseListDialog
          open={!!dialog}
          onOpenChange={(v) => !v && setDialog(null)}
          productId={dialog.id}
          productName={dialog.name}
          currentStock={dialog.stock}
          minStock={dialog.min_stock}
        />
      )}
    </Tabs>
  );
}
