import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, Package2, Search } from 'lucide-react';

interface ProductLite {
  id: string;
  name: string;
  category: string;
  image_url: string | null;
  stock: number;
  min_stock: number;
  variation_id?: string | null;
  variation_name?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (product: ProductLite) => void;
}

export function ProductSearchDialog({ open, onOpenChange, onSelect }: Props) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ProductLite[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch('');
    (async () => {
      const [prodsRes, varsRes] = await Promise.all([
        supabase.rpc('get_products_admin'),
        supabase.from('product_variations').select('id, product_id, name, stock, image_url'),
      ]);

      const products = (prodsRes.data ?? []) as any[];
      const variations = (varsRes.data ?? []) as any[];

      const varsByProduct = new Map<string, any[]>();
      variations.forEach((v) => {
        if (!varsByProduct.has(v.product_id)) varsByProduct.set(v.product_id, []);
        varsByProduct.get(v.product_id)!.push(v);
      });

      const list: ProductLite[] = [];
      for (const p of products) {
        if (p.category === 'Pendente Revisão') continue;
        const prodVars = varsByProduct.get(p.id) ?? [];
        if (prodVars.length > 0) {
          for (const v of prodVars) {
            list.push({
              id: p.id,
              name: p.name,
              category: p.category,
              image_url: v.image_url ?? p.image_url,
              stock: Number(v.stock ?? 0),
              min_stock: Number(p.min_stock ?? 0),
              variation_id: v.id,
              variation_name: v.name,
            });
          }
        } else {
          list.push({
            id: p.id,
            name: p.name,
            category: p.category,
            image_url: p.image_url,
            stock: Number(p.stock ?? 0),
            min_stock: Number(p.min_stock ?? 0),
            variation_id: null,
            variation_name: null,
          });
        }
      }

      list.sort((a, b) => {
        const an = a.variation_name ? `${a.name} ${a.variation_name}` : a.name;
        const bn = b.variation_name ? `${b.name} ${b.variation_name}` : b.name;
        return an.localeCompare(bn);
      });
      setItems(list);
      setLoading(false);
    })();
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items.slice(0, 100);
    return items
      .filter((p) => {
        const hay = `${p.name} ${p.variation_name ?? ''} ${p.category}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 100);
  }, [items, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar produto à lista</DialogTitle>
          <DialogDescription>Busque qualquer produto ou variação do catálogo</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Buscar por nome, variação ou categoria..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-[420px] overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Nenhum produto encontrado.
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((p) => (
                <li key={`${p.id}|${p.variation_id ?? ''}`}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 py-2 px-2 hover:bg-accent rounded text-left"
                    onClick={() => {
                      onSelect(p);
                      onOpenChange(false);
                    }}
                  >
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded object-cover bg-muted shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                        <Package2 className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {p.name}
                        {p.variation_name && (
                          <span className="text-muted-foreground"> — {p.variation_name}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.category} • Estoque: {p.stock}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { ProductLite };
