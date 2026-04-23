import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Home, X, SlidersHorizontal } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCart } from '@/hooks/useCart';
import { useProductQuantity } from '@/hooks/useProductQuantity';
import { Product } from '@/types/product';
import { ProductCard } from '@/components/ProductCard';
import { useCategories } from '@/hooks/useCategories';

export default function Products() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category') || '';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { categories: dbCategories } = useCategories();
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedPounds, setSelectedPounds] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const { toast } = useToast();
  const { addItem } = useCart();
  const { getQuantity, setQuantity, incrementQuantity, decrementQuantity } = useProductQuantity();

  useEffect(() => {
    loadProducts();
  }, [categoryParam]);

  // Reset filters quando muda categoria
  useEffect(() => {
    setSelectedBrands([]);
    setSelectedPounds([]);
    setSelectedSizes([]);
  }, [categoryParam]);

  const loadProducts = async () => {
    setLoading(true);
    let query = supabase
      .from('products')
      .select(`*, variations:product_variations(*)`)
      .gt('stock', 0)
      .order('name', { ascending: true });

    if (categoryParam) query = query.eq('category', categoryParam);

    const { data, error } = await query;

    if (error) {
      toast({ title: 'Erro ao carregar produtos', description: error.message, variant: 'destructive' });
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  const handleCategoryChange = (category: string) => {
    setSearchParams(category ? { category } : {});
  };

  // Opções dinâmicas a partir dos produtos carregados
  const { brandOptions, poundOptions, sizeOptions } = useMemo(() => {
    const brands = new Set<string>();
    const pounds = new Set<string>();
    const sizes = new Set<string>();
    products.forEach(p => {
      if (p.brand) brands.add(p.brand);
      if (p.pound_test) pounds.add(p.pound_test);
      if (p.size) sizes.add(p.size);
    });
    const sorter = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
    return {
      brandOptions: Array.from(brands).sort(sorter),
      poundOptions: Array.from(pounds).sort(sorter),
      sizeOptions: Array.from(sizes).sort(sorter),
    };
  }, [products]);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  };

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return products.filter(p => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (selectedBrands.length && (!p.brand || !selectedBrands.includes(p.brand))) return false;
      if (selectedPounds.length && (!p.pound_test || !selectedPounds.includes(p.pound_test))) return false;
      if (selectedSizes.length && (!p.size || !selectedSizes.includes(p.size))) return false;
      return true;
    });
  }, [products, searchQuery, selectedBrands, selectedPounds, selectedSizes]);

  const totalActiveFilters = selectedBrands.length + selectedPounds.length + selectedSizes.length;
  const clearAllFilters = () => {
    setSelectedBrands([]);
    setSelectedPounds([]);
    setSelectedSizes([]);
  };

  const hasAnyAttribute = brandOptions.length + poundOptions.length + sizeOptions.length > 0;

  const renderFilterGroup = (
    title: string,
    options: string[],
    selected: string[],
    setSelected: (v: string[]) => void
  ) => {
    if (options.length === 0) return null;
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <div className="flex flex-wrap gap-2">
          {options.map(opt => {
            const active = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(selected, setSelected, opt)}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-border'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 pt-24 pb-20">
        <Button variant="ghost" className="mb-6" onClick={() => window.location.href = '/'}>
          <Home className="w-4 h-4 mr-2" />
          Voltar à Home
        </Button>

        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {categoryParam || 'Todos os Produtos'}
          </h1>
          <p className="text-xl text-muted-foreground mb-6">
            Encontre os melhores equipamentos de pesca
          </p>
          <div className="max-w-md mx-auto">
            <Input
              placeholder="Procurar produto por nome..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-lg"
            />
          </div>
        </div>

        {/* Filtros de Categoria */}
        <div className="flex flex-wrap gap-3 justify-center mb-8">
          <Badge
            variant={categoryParam === '' ? 'default' : 'outline'}
            className="cursor-pointer px-6 py-2 text-base hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={() => handleCategoryChange('')}
          >
            Todas
          </Badge>
          {dbCategories.map((cat) => (
            <Badge
              key={cat.id}
              variant={categoryParam === cat.name ? 'default' : 'outline'}
              className="cursor-pointer px-6 py-2 text-base hover:bg-primary hover:text-primary-foreground transition-colors"
              onClick={() => handleCategoryChange(cat.name)}
            >
              {cat.name}
            </Badge>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar de Filtros */}
          {hasAnyAttribute && (
            <aside className="lg:w-64 lg:shrink-0">
              <div className="lg:sticky lg:top-24 bg-card border rounded-xl p-4 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4" />
                    <h3 className="font-semibold">Filtros</h3>
                  </div>
                  {totalActiveFilters > 0 && (
                    <button
                      onClick={clearAllFilters}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Limpar
                    </button>
                  )}
                </div>

                {renderFilterGroup('Marca', brandOptions, selectedBrands, setSelectedBrands)}
                {renderFilterGroup('Libragem', poundOptions, selectedPounds, setSelectedPounds)}
                {renderFilterGroup('Tamanho', sizeOptions, selectedSizes, setSelectedSizes)}

                {totalActiveFilters === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Selecione opções para refinar a busca.
                  </p>
                )}
              </div>
            </aside>
          )}

          {/* Lista de Produtos */}
          <div className="flex-1">
            {loading ? (
              <div className="text-center py-20">
                <p className="text-xl text-muted-foreground">Carregando produtos...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-xl text-muted-foreground">
                  Nenhum produto encontrado com esses filtros.
                </p>
                {totalActiveFilters > 0 && (
                  <Button variant="outline" className="mt-4" onClick={clearAllFilters}>
                    Limpar filtros
                  </Button>
                )}
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  {filteredProducts.length} {filteredProducts.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      quantity={getQuantity(product.id)}
                      onQuantityChange={(qty) => setQuantity(product.id, qty)}
                      onIncrement={() => incrementQuantity(product.id, product.stock)}
                      onDecrement={() => decrementQuantity(product.id)}
                      onAddToCart={() => {
                        const qty = getQuantity(product.id);
                        addItem({
                          id: product.id,
                          name: product.name,
                          price: product.on_sale && product.sale_price ? product.sale_price : product.price,
                          image_url: product.image_url
                        }, qty);
                        toast({
                          title: 'Produto adicionado!',
                          description: `${qty} unidade(s) adicionada(s) ao carrinho.`
                        });
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
