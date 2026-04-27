import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Check, Search, Loader2, Package } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  subcategory: string | null;
  image_url: string | null;
  images: string[] | null;
  price: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subcategoryName: string;
  primaryName?: string;
}

export function SubcategoryProductPicker({
  open,
  onOpenChange,
  subcategoryName,
  primaryName,
}: Props) {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setSearch('');
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, category, subcategory, image_url, images, price')
        .order('name', { ascending: true })
        .limit(1000);
      if (error) {
        toast({ title: 'Erro ao carregar produtos', description: error.message, variant: 'destructive' });
      } else {
        setProducts((data as Product[]) || []);
      }
      setLoading(false);
    })();
  }, [open, toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
    );
  }, [products, search]);

  const handleSelect = async (product: Product) => {
    if (product.subcategory === subcategoryName) return;
    setSavingIds((prev) => new Set(prev).add(product.id));

    const update: any = { subcategory: subcategoryName };
    // Se o produto não está na primária pai, alinha também
    if (primaryName && product.category !== primaryName) {
      update.category = primaryName;
    }

    const { error } = await supabase.from('products').update(update).eq('id', product.id);

    setSavingIds((prev) => {
      const next = new Set(prev);
      next.delete(product.id);
      return next;
    });

    if (error) {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
      return;
    }

    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id
          ? { ...p, subcategory: subcategoryName, category: update.category ?? p.category }
          : p
      )
    );
    toast({ title: 'Produto adicionado!', description: product.name });
  };

  const getThumb = (p: Product) => p.image_url || p.images?.[0] || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Adicionar produtos à subcategoria{' '}
            <span className="text-primary">"{subcategoryName}"</span>
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, SKU ou categoria..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Carregando produtos...
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">
              Nenhum produto encontrado.
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((p) => {
                const isInThisSub = p.subcategory === subcategoryName;
                const isSaving = savingIds.has(p.id);
                const thumb = getThumb(p);
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 p-2 border rounded-md hover:bg-muted/40 transition-colors"
                  >
                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                      {thumb ? (
                        <img src={thumb} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {p.sku && (
                          <span className="text-xs text-muted-foreground">SKU: {p.sku}</span>
                        )}
                        <Badge variant="outline" className="text-[10px] py-0 h-4">
                          {p.category}
                        </Badge>
                        {p.subcategory && (
                          <Badge
                            variant={isInThisSub ? 'default' : 'secondary'}
                            className="text-[10px] py-0 h-4"
                          >
                            {p.subcategory}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isInThisSub ? 'secondary' : 'default'}
                      onClick={() => handleSelect(p)}
                      disabled={isInThisSub || isSaving}
                      className="flex-shrink-0"
                    >
                      {isSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isInThisSub ? (
                        <>
                          <Check className="w-3.5 h-3.5 mr-1" /> Já está
                        </>
                      ) : (
                        'Selecionar'
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
