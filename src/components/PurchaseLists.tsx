import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2, Trash2, Copy, ShoppingBasket, ChevronDown, ChevronRight, Plus, Package2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AddToPurchaseListDialog } from './AddToPurchaseListDialog';
import { ProductSearchDialog, ProductLite } from './ProductSearchDialog';

interface ListRow {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
}

interface ItemRow {
  id: string;
  list_id: string;
  product_id: string;
  variation_id: string | null;
  quantity: number;
  product_name: string;
  product_image: string | null;
  variation_name: string | null;
}

export function PurchaseLists() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [itemsByList, setItemsByList] = useState<Record<string, ItemRow[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [searchOpenForList, setSearchOpenForList] = useState<string | null>(null);
  const [pendingAdd, setPendingAdd] = useState<{ product: ProductLite; listId: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: ls } = await supabase
      .from('purchase_lists')
      .select('id, name, notes, created_at')
      .order('created_at', { ascending: false });

    const lsRows = (ls ?? []) as ListRow[];
    setLists(lsRows);

    if (lsRows.length === 0) {
      setItemsByList({});
      setLoading(false);
      return;
    }

    const { data: items } = await supabase
      .from('purchase_list_items')
      .select('id, list_id, product_id, variation_id, quantity')
      .in('list_id', lsRows.map((l) => l.id));

    const productIds = Array.from(new Set((items ?? []).map((i) => i.product_id)));
    const variationIds = Array.from(
      new Set((items ?? []).map((i) => i.variation_id).filter(Boolean) as string[])
    );

    const [prodsRes, varsRes] = await Promise.all([
      productIds.length
        ? supabase.from('products').select('id, name, image_url').in('id', productIds)
        : Promise.resolve({ data: [] as any[] }),
      variationIds.length
        ? supabase.from('product_variations').select('id, name, image_url').in('id', variationIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const prodMap = new Map(
      (prodsRes.data ?? []).map((p: any) => [p.id, { name: p.name, image_url: p.image_url as string | null }])
    );
    const varMap = new Map(
      (varsRes.data ?? []).map((v: any) => [v.id, { name: v.name, image_url: v.image_url as string | null }])
    );

    const grouped: Record<string, ItemRow[]> = {};
    (items ?? []).forEach((i: any) => {
      const prod = prodMap.get(i.product_id);
      const vari = i.variation_id ? varMap.get(i.variation_id) : null;
      // Se o item tinha variation_id mas a variação não existe mais no banco,
      // sinalizamos para o usuário ("variação removida") em vez de mostrar
      // o item como se fosse o produto pai sem variação.
      const orphanVariation = !!i.variation_id && !vari;
      const row: ItemRow = {
        id: i.id,
        list_id: i.list_id,
        product_id: i.product_id,
        variation_id: i.variation_id,
        quantity: Number(i.quantity),
        product_name: prod?.name ?? 'Produto removido',
        product_image: vari?.image_url ?? prod?.image_url ?? null,
        variation_name: vari?.name ?? (orphanVariation ? '⚠ variação removida' : null),
      };
      (grouped[i.list_id] ||= []).push(row);
    });
    Object.keys(grouped).forEach((k) => {
      grouped[k].sort((a, b) => {
        const an = (a.variation_name ? `${a.product_name} - ${a.variation_name}` : a.product_name).toLowerCase();
        const bn = (b.variation_name ? `${b.product_name} - ${b.variation_name}` : b.product_name).toLowerCase();
        return an.localeCompare(bn, 'pt-BR');
      });
    });
    setItemsByList(grouped);
    setExpanded((prev) => {
      const next = { ...prev };
      lsRows.forEach((l) => {
        if (next[l.id] === undefined) next[l.id] = true;
      });
      return next;
    });
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('purchase_lists_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_list_items' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_lists' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const buildText = (list: ListRow) => {
    const items = itemsByList[list.id] ?? [];
    if (items.length === 0) return `${list.name}\n(vazia)`;
    const lines = items.map((i) => {
      const name = i.variation_name ? `${i.product_name} - ${i.variation_name}` : i.product_name;
      return `${i.quantity}x ${name}`;
    });
    return `*${list.name}*\n${lines.join('\n')}`;
  };

  const handleCopy = async (list: ListRow) => {
    await navigator.clipboard.writeText(buildText(list));
    toast({ title: 'Lista copiada' });
  };

  const handleDeleteList = async (id: string) => {
    if (!confirm('Excluir esta lista e todos os seus itens?')) return;
    const { error } = await supabase.from('purchase_lists').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Lista excluída' });
    load();
  };

  const handleDeleteItem = async (id: string) => {
    const { error } = await supabase.from('purchase_list_items').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao remover item', variant: 'destructive' });
      return;
    }
    load();
  };

  const handleQty = async (item: ItemRow, qty: number) => {
    if (qty <= 0) {
      handleDeleteItem(item.id);
      return;
    }
    await supabase.from('purchase_list_items').update({ quantity: qty }).eq('id', item.id);
    setItemsByList((prev) => ({
      ...prev,
      [item.list_id]: prev[item.list_id].map((i) => (i.id === item.id ? { ...i, quantity: qty } : i)),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (lists.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <ShoppingBasket className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhuma lista de compras criada ainda.</p>
          <p className="text-xs mt-1">Use o botão "Adicionar à lista" em qualquer produto.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {lists.map((list) => {
        const items = itemsByList[list.id] ?? [];
        const isOpen = expanded[list.id];
        return (
          <Card key={list.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  className="flex items-center gap-2 text-left flex-1 min-w-0"
                  onClick={() => setExpanded((p) => ({ ...p, [list.id]: !p[list.id] }))}
                >
                  {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                  <div className="min-w-0">
                    <div className="font-medium truncate">{list.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {items.length} {items.length === 1 ? 'item' : 'itens'}
                    </div>
                  </div>
                </button>
                <Button size="sm" variant="outline" onClick={() => setSearchOpenForList(list.id)}>
                  <Plus className="w-3 h-3 mr-1" /> Produto
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleCopy(list)}>
                  <Copy className="w-3 h-3 mr-1" /> Copiar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDeleteList(list.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>

              {isOpen && (
                <>
                  <div className="space-y-1 border-t pt-3">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Lista vazia</p>
                    ) : (
                      items.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 py-2">
                          <input
                            type="number"
                            min={0}
                            value={item.quantity}
                            onChange={(e) => handleQty(item, Math.max(0, Number(e.target.value) || 0))}
                            className="w-16 h-9 rounded border bg-background px-2 text-sm shrink-0"
                          />
                          {item.product_image ? (
                            <img
                              src={item.product_image}
                              alt={item.product_name}
                              className="w-20 h-20 rounded-md object-cover bg-muted shrink-0"
                            />
                          ) : (
                            <div className="w-20 h-20 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <Package2 className="w-8 h-8 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0 text-sm truncate">
                            {item.product_name}
                            {item.variation_name && (
                              <span className="text-muted-foreground"> — {item.variation_name}</span>
                            )}
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteItem(item.id)}>
                            <Trash2 className="w-3 h-3 text-muted-foreground" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>

                  {items.length > 0 && (
                    <Textarea
                      readOnly
                      value={buildText(list)}
                      rows={Math.min(10, items.length + 1)}
                      className="font-mono text-xs"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      <ProductSearchDialog
        open={!!searchOpenForList}
        onOpenChange={(v) => !v && setSearchOpenForList(null)}
        onSelect={(product) => {
          if (searchOpenForList) {
            setPendingAdd({ product, listId: searchOpenForList });
            setSearchOpenForList(null);
          }
        }}
      />

      {pendingAdd && (
        <AddToPurchaseListDialog
          open={!!pendingAdd}
          onOpenChange={(v) => {
            if (!v) {
              setPendingAdd(null);
              load();
            }
          }}
          productId={pendingAdd.product.id}
          productName={
            pendingAdd.product.variation_name
              ? `${pendingAdd.product.name} — ${pendingAdd.product.variation_name}`
              : pendingAdd.product.name
          }
          variationId={pendingAdd.product.variation_id ?? null}
          currentStock={pendingAdd.product.stock}
          minStock={pendingAdd.product.min_stock}
          defaultListId={pendingAdd.listId}
        />
      )}
    </div>
  );
}
