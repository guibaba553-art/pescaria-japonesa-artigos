import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, ShoppingBasket } from 'lucide-react';

interface PurchaseList {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string;
  productName: string;
  variationId?: string | null;
  /** Estoque atual usado no cálculo da sugestão */
  currentStock?: number;
  /** Estoque mínimo configurado */
  minStock?: number;
  /** Pré-seleciona uma lista existente */
  defaultListId?: string;
}

/**
 * Calcula sugestão simples de compra com base no giro dos últimos 60 dias
 * (vendas no site + PDV) menos estoque atual, com piso de min_stock.
 */
async function suggestQuantity(productId: string, currentStock: number, minStock: number): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - 60);

  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .gte('created_at', since.toISOString())
    .in('status', ['em_preparo', 'enviado', 'entregado', 'retirado']);

  const orderIds = (orders ?? []).map((o) => o.id);
  let sold = 0;
  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from('order_items')
      .select('quantity')
      .eq('product_id', productId)
      .in('order_id', orderIds);
    sold = (items ?? []).reduce((s, i) => s + Number(i.quantity), 0);
  }

  // projetar 30 dias de cobertura
  const perDay = sold / 60;
  const target = Math.ceil(perDay * 30);
  const need = Math.max(target - currentStock, minStock - currentStock, 1);
  return Math.max(1, need);
}

export function AddToPurchaseListDialog({
  open, onOpenChange, productId, productName, variationId = null,
  currentStock = 0, minStock = 0,
}: Props) {
  const { toast } = useToast();
  const [lists, setLists] = useState<PurchaseList[]>([]);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedList, setSelectedList] = useState<string>('');
  const [newListName, setNewListName] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [suggested, setSuggested] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const [listsRes, sugg] = await Promise.all([
        supabase.from('purchase_lists').select('id, name').order('created_at', { ascending: false }),
        suggestQuantity(productId, currentStock, minStock),
      ]);
      const ls = (listsRes.data ?? []) as PurchaseList[];
      setLists(ls);
      setSuggested(sugg);
      setQuantity(sugg);
      if (ls.length === 0) {
        setMode('new');
        setNewListName('Lista de compras');
      } else {
        setMode('existing');
        setSelectedList(ls[0].id);
      }
      setLoading(false);
    })();
  }, [open, productId, currentStock, minStock]);

  const handleSave = async () => {
    if (quantity <= 0) {
      toast({ title: 'Quantidade inválida', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessão expirada');

      let listId = selectedList;
      if (mode === 'new') {
        if (!newListName.trim()) {
          toast({ title: 'Informe um nome para a lista', variant: 'destructive' });
          setSaving(false);
          return;
        }
        const { data, error } = await supabase
          .from('purchase_lists')
          .insert({ name: newListName.trim(), created_by: user.id })
          .select('id')
          .single();
        if (error) throw error;
        listId = data.id;
      }

      // Tenta inserir; se já existir, soma a quantidade
      const { error: insErr } = await supabase
        .from('purchase_list_items')
        .insert({
          list_id: listId,
          product_id: productId,
          variation_id: variationId,
          quantity,
          added_by: user.id,
        });

      if (insErr) {
        // Conflito: somar
        const { data: existing } = await supabase
          .from('purchase_list_items')
          .select('id, quantity')
          .eq('list_id', listId)
          .eq('product_id', productId)
          .is('variation_id', variationId ?? null as any)
          .maybeSingle();
        if (existing) {
          await supabase
            .from('purchase_list_items')
            .update({ quantity: Number(existing.quantity) + quantity })
            .eq('id', existing.id);
        } else {
          throw insErr;
        }
      }

      toast({ title: 'Adicionado à lista de compras' });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Erro ao adicionar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBasket className="w-5 h-5" /> Adicionar à lista de compras
          </DialogTitle>
          <DialogDescription className="truncate">{productName}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {lists.length > 0 && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={mode === 'existing' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode('existing')}
                >
                  Lista existente
                </Button>
                <Button
                  type="button"
                  variant={mode === 'new' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode('new')}
                >
                  <Plus className="w-3 h-3 mr-1" /> Nova lista
                </Button>
              </div>
            )}

            {mode === 'existing' ? (
              <div className="space-y-2">
                <Label>Selecionar lista</Label>
                <Select value={selectedList} onValueChange={setSelectedList}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {lists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Nome da nova lista</Label>
                <Input
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="Ex: Pedido fornecedor X"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              />
              {suggested !== null && (
                <p className="text-xs text-muted-foreground">
                  Sugestão baseada em vendas (60d) + estoque mínimo:{' '}
                  <button
                    type="button"
                    className="underline text-primary"
                    onClick={() => setQuantity(suggested)}
                  >
                    usar {suggested}
                  </button>
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
