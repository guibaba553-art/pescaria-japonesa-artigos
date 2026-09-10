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
import { useCategories } from '@/hooks/useCategories';
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
  /** Cadeia de subcategorias acima desta (pai, avô, ...) — limita os produtos candidatos */
  ancestorSubcategoryNames?: string[];
}

export function SubcategoryProductPicker({
  open,
  onOpenChange,
  subcategoryName,
  primaryName,
  ancestorSubcategoryNames,
}: Props) {
  const { toast } = useToast();
  const { categories: allCategories } = useCategories();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  // Grupos (nomes) de cada produto via tabela N:N
  const [groupsByProduct, setGroupsByProduct] = useState<Record<string, string[]>>({});

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

      const { data: links } = await supabase
        .from('product_categories')
        .select('product_id, category_id')
        .limit(20000);
      const map: Record<string, string[]> = {};
      (links || []).forEach((l: any) => {
        map[l.product_id] = [...(map[l.product_id] || []), l.category_id];
      });
      setGroupsByProduct(map);
      setLoading(false);
    })();
  }, [open, toast]);

  const groupNamesOf = (productId: string) =>
    (groupsByProduct[productId] || [])
      .map((id) => allCategories.find((c) => c.id === id)?.name)
      .filter(Boolean) as string[];

  const scoped = useMemo(() => {
    let list = products;
    if (primaryName) {
      list = list.filter((p) => p.category === primaryName);
    }
    const ancestors = ancestorSubcategoryNames ?? [];
    if (ancestors.length > 0) {
      const allowed = new Set([...ancestors, subcategoryName]);
      list = list.filter(
        (p) =>
          (p.subcategory && allowed.has(p.subcategory)) ||
          groupNamesOf(p.id).some((n) => allowed.has(n))
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, primaryName, ancestorSubcategoryNames, subcategoryName, groupsByProduct, allCategories]);

  // Ao buscar, procura em TODO o catálogo (um produto pode pertencer a vários
  // grupos independentes, mesmo fora da família da categoria atual).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    const match = (p: Product) =>
      p.name.toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q);
    const inScope = scoped.filter(match);
    const inScopeIds = new Set(inScope.map((p) => p.id));
    const outOfScope = products.filter((p) => !inScopeIds.has(p.id) && match(p));
    return [...inScope, ...outOfScope];
  }, [scoped, products, search]);


  const handleSelect = async (product: Product) => {
    setSavingIds((prev) => new Set(prev).add(product.id));

    // Vínculo N:N — o produto pode pertencer a vários grupos ao mesmo tempo
    const target = allCategories.find((c) => c.name === subcategoryName);
    let error: { message: string } | null = null;
    if (target) {
      const { error: linkError } = await supabase
        .from('product_categories')
        .upsert({ product_id: product.id, category_id: target.id }, { onConflict: 'product_id,category_id' });
      if (linkError) error = linkError;
    }

    // Campo legado: só preenche quando o produto ainda não tem grupo principal
    const update: any = {};
    if (!product.subcategory) update.subcategory = subcategoryName;
    if (primaryName && !product.category) update.category = primaryName;
    if (!error && Object.keys(update).length > 0) {
      const { error: updError } = await supabase.from('products').update(update).eq('id', product.id);
      if (updError) error = updError;
    }


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
          ? {
              ...p,
              subcategory: update.subcategory ?? p.subcategory,
              category: update.category ?? p.category,
            }
          : p
      )
    );
    if (target) {
      setGroupsByProduct((prev) => ({
        ...prev,
        [product.id]: Array.from(new Set([...(prev[product.id] || []), target.id])),
      }));
    }
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
                const isInThisSub =
                  p.subcategory === subcategoryName || groupNamesOf(p.id).includes(subcategoryName);
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
