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
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (product: ProductLite) => void;
}

export function ProductSearchDialog({ open, onOpenChange, onSelect }: Props) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch('');
    (async () => {
      const { data } = await supabase.rpc('get_products_admin');
      const list = (data ?? [])
        .filter((p: any) => p.category !== 'Pendente Revisão')
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          image_url: p.image_url,
          stock: Number(p.stock ?? 0),
          min_stock: Number(p.min_stock ?? 0),
        })) as ProductLite[];
      list.sort((a, b) => a.name.localeCompare(b.name));
      setProducts(list);
      setLoading(false);
    })();
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 100);
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      .slice(0, 100);
  }, [products, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar produto à lista</DialogTitle>
          <DialogDescription>Busque qualquer produto do catálogo</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Buscar por nome ou categoria..."
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
                <li key={p.id}>
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
                      <div className="text-sm font-medium truncate">{p.name}</div>
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
