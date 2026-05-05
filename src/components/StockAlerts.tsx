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
import { ProductEdit } from './ProductEdit';
import type { Product } from '@/types/product';

interface AlertItem {
  key: string; // product_id|variation_id
  product_id: string;
  variation_id: string | null;
  name: string;
  variation_name: string | null;
  stock: number;
  min_stock: number;
  category: string;
  image_url: string | null;
}

export function StockAlerts() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AlertItem[]>([]);
  const [dialog, setDialog] = useState<AlertItem | null>(null);
  const [editProduct, setEditProduct] = useState<Product | null>(null);

  const openProductEdit = async (productId: string) => {
    const { data, error } = await supabase.rpc('get_product_admin', { p_id: productId });
    if (error || !data || data.length === 0) {
      toast({ title: 'Erro ao carregar produto', description: error?.message, variant: 'destructive' });
      return;
    }
    setEditProduct(data[0] as Product);
  };

  const load = async () => {
    const [prodsRes, varsRes, listItemsRes, dismissedRes] = await Promise.all([
      supabase.rpc('get_products_admin'),
      supabase.from('product_variations').select('id, product_id, name, stock, image_url, min_stock'),
      supabase.from('purchase_list_items').select('product_id, variation_id'),
      supabase.from('dismissed_stock_alerts').select('product_id, variation_id'),
    ]);

    const keyOf = (pid: string, vid: string | null) => `${pid}|${vid ?? ''}`;
    const inListKeys = new Set(
      (listItemsRes.data ?? []).map((i: any) => keyOf(i.product_id, i.variation_id))
    );
    const dismissedKeys = new Set(
      (dismissedRes.data ?? []).map((i: any) => keyOf(i.product_id, i.variation_id))
    );

    const products = (prodsRes.data ?? []) as any[];
    const variations = (varsRes.data ?? []) as any[];

    // Agrupa variações por produto
    const varsByProduct = new Map<string, any[]>();
    variations.forEach((v) => {
      if (!varsByProduct.has(v.product_id)) varsByProduct.set(v.product_id, []);
      varsByProduct.get(v.product_id)!.push(v);
    });

    const result: AlertItem[] = [];

    for (const p of products) {
      if (p.category === 'Pendente Revisão') continue;
      const prodVars = varsByProduct.get(p.id) ?? [];

      if (prodVars.length > 0) {
        // Produto com variações: alerta apenas por variação
        for (const v of prodVars) {
          const stock = Number(v.stock ?? 0);
          const varMin = Number(v.min_stock ?? 0);
          const isAlert = stock === 0 || (varMin > 0 && stock <= varMin);
          if (!isAlert) continue;
          const k = keyOf(p.id, v.id);
          if (inListKeys.has(k) || dismissedKeys.has(k)) continue;
          result.push({
            key: k,
            product_id: p.id,
            variation_id: v.id,
            name: p.name,
            variation_name: v.name,
            stock,
            min_stock: varMin,
            category: p.category,
            image_url: v.image_url ?? p.image_url,
          });
        }
      } else {
        // Produto sem variações: usa estoque do próprio produto
        const stock = Number(p.stock ?? 0);
        const isAlert = stock === 0 || (p.min_stock > 0 && stock <= p.min_stock);
        if (!isAlert) continue;
        const k = keyOf(p.id, null);
        if (inListKeys.has(k) || dismissedKeys.has(k)) continue;
        result.push({
          key: k,
          product_id: p.id,
          variation_id: null,
          name: p.name,
          variation_name: null,
          stock,
          min_stock: p.min_stock,
          category: p.category,
          image_url: p.image_url,
        });
      }
    }

    result.sort((a, b) => a.stock - b.stock);
    setItems(result);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('purchase_list_items_alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_list_items' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dismissed_stock_alerts' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleDismiss = async (it: AlertItem) => {
    setItems((prev) => prev.filter((x) => x.key !== it.key));
    const { error } = await supabase
      .from('dismissed_stock_alerts')
      .insert({ product_id: it.product_id, variation_id: it.variation_id });
    if (error) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
      load();
      return;
    }
    toast({
      title: 'Removido dos alertas',
      description: it.variation_name ? `${it.name} — ${it.variation_name}` : it.name,
    });
  };

  const outOfStock = items.filter((p) => p.stock === 0);
  const lowStock = items.filter((p) => p.stock > 0);

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

            {items.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Package2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Nenhum produto com alerta de estoque 🎉</p>
                  <p className="text-xs mt-1">Configure o estoque mínimo nos produtos para receber alertas.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {items.map((p) => {
                  const isOut = p.stock === 0;
                  return (
                    <Card
                      key={p.key}
                      className={`transition-colors ${isOut ? 'border-destructive/40' : 'border-amber-500/40'}`}
                    >
                      <CardContent className="p-3 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openProductEdit(p.product_id)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                        >
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} className="w-20 h-20 rounded object-cover bg-muted" />
                          ) : (
                            <div className="w-20 h-20 rounded bg-muted flex items-center justify-center">
                              <Package2 className="w-8 h-8 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {p.name}
                              {p.variation_name && (
                                <span className="text-muted-foreground"> — {p.variation_name}</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{p.category}</div>
                          </div>
                        </button>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDismiss(p)}
                          className="shrink-0"
                          title="Remover dos alertas (não exclui o produto)"
                        >
                          <X className="w-4 h-4 text-muted-foreground" />
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
          productId={dialog.product_id}
          variationId={dialog.variation_id}
          productName={
            dialog.variation_name ? `${dialog.name} — ${dialog.variation_name}` : dialog.name
          }
          currentStock={dialog.stock}
          minStock={dialog.min_stock}
        />
      )}

      {editProduct && (
        <ProductEdit
          product={editProduct}
          onUpdate={() => { load(); }}
          open={!!editProduct}
          onOpenChange={(v) => !v && setEditProduct(null)}
          hideTrigger
        />
      )}
    </Tabs>
  );
}
