import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Home, X, SlidersHorizontal, Filter } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCart } from '@/hooks/useCart';
import { useProductQuantity } from '@/hooks/useProductQuantity';
import { Product } from '@/types/product';
import { ProductCard } from '@/components/ProductCard';
import { useCategories } from '@/hooks/useCategories';

type SortOption = 'name_asc' | 'price_asc' | 'price_desc' | 'newest';

export default function Products() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category') || '';
  const subcategoryParam = searchParams.get('subcategory') || '';
  const searchParam = searchParams.get('search') || '';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParam);

  // Sincroniza o input com o parâmetro de URL quando muda (ex: nova busca pelo header)
  useEffect(() => {
    setSearchQuery(searchParam);
  }, [searchParam]);
  const { primaries, getSubcategoriesOf } = useCategories();
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedPounds, setSelectedPounds] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('name_asc');
  const { toast } = useToast();
  const { addItem } = useCart();
  const { getQuantity, setQuantity, incrementQuantity, decrementQuantity } = useProductQuantity();

  useEffect(() => {
    loadProducts();
  }, [categoryParam, subcategoryParam]);

  // Reset filters quando muda categoria
  useEffect(() => {
    setSelectedBrands([]);
    setSelectedPounds([]);
    setSelectedSizes([]);
    setSelectedSubcategories([]);
    setPriceRange(null);
  }, [categoryParam, subcategoryParam]);

  const loadProducts = async () => {
    setLoading(true);
    // Selecionar apenas colunas necessárias para o card — reduz drasticamente o payload
    // (omite description, images[], short_description, sku, etc. que só são usados em ProductDetails)
    let query = supabase
      .from('products')
      .select(`
        id, name, price, sale_price, on_sale, sale_ends_at,
        category, subcategory, brand, pound_test, size,
        image_url, stock, rating, featured, minimum_quantity,
        sold_by_weight, created_at,
        variations:product_variations(id, name, price, stock, image_url)
      `)
      .eq('pdv_only', false)
      .gt('stock', 0)
      .order('name', { ascending: true })
      .limit(1000);

    if (categoryParam) query = query.eq('category', categoryParam);
    if (subcategoryParam) query = query.eq('subcategory', subcategoryParam);

    const { data, error } = await query;

    if (error) {
      toast({ title: 'Erro ao carregar produtos', description: error.message, variant: 'destructive' });
    } else {
      setProducts((data || []) as unknown as Product[]);
    }
    setLoading(false);
  };

  const handleCategoryChange = (category: string) => {
    setSearchParams(category ? { category } : {});
  };

  const handleSubcategoryChange = (subcategory: string) => {
    if (!categoryParam) return;
    setSearchParams(subcategory ? { category: categoryParam, subcategory } : { category: categoryParam });
  };

  // Faixa de preço dinâmica baseada nos produtos
  // Usa reduce para evitar erro "Maximum call stack" com Math.min/max(...arr) em listas grandes
  const { minPrice, maxPrice } = useMemo(() => {
    if (products.length === 0) return { minPrice: 0, maxPrice: 0 };
    let min = Infinity;
    let max = -Infinity;
    for (const p of products) {
      const price = p.on_sale && p.sale_price ? p.sale_price : p.price;
      if (typeof price !== 'number' || !isFinite(price)) continue;
      if (price < min) min = price;
      if (price > max) max = price;
    }
    if (!isFinite(min) || !isFinite(max)) return { minPrice: 0, maxPrice: 0 };
    return {
      minPrice: Math.floor(min),
      maxPrice: Math.ceil(max),
    };
  }, [products]);

  // Inicializa o range de preço quando produtos mudam
  useEffect(() => {
    if (products.length > 0 && priceRange === null) {
      setPriceRange([minPrice, maxPrice]);
    }
  }, [products, minPrice, maxPrice, priceRange]);

  // Opções dinâmicas a partir dos produtos carregados
  const { brandOptions, poundOptions, sizeOptions, subcategoryOptions } = useMemo(() => {
    const brands = new Set<string>();
    const pounds = new Set<string>();
    const sizes = new Set<string>();
    const subs = new Set<string>();
    products.forEach(p => {
      if (p.brand) brands.add(p.brand);
      if (p.pound_test) pounds.add(p.pound_test);
      if (p.size) sizes.add(p.size);
      if (p.subcategory) subs.add(p.subcategory);
    });
    const sorter = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
    return {
      brandOptions: Array.from(brands).sort(sorter),
      poundOptions: Array.from(pounds).sort(sorter),
      sizeOptions: Array.from(sizes).sort(sorter),
      subcategoryOptions: Array.from(subs).sort(sorter),
    };
  }, [products]);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  };

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = products.filter(p => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (selectedBrands.length && (!p.brand || !selectedBrands.includes(p.brand))) return false;
      if (selectedPounds.length && (!p.pound_test || !selectedPounds.includes(p.pound_test))) return false;
      if (selectedSizes.length && (!p.size || !selectedSizes.includes(p.size))) return false;
      if (selectedSubcategories.length && (!p.subcategory || !selectedSubcategories.includes(p.subcategory))) return false;
      if (priceRange) {
        const effectivePrice = p.on_sale && p.sale_price ? p.sale_price : p.price;
        if (effectivePrice < priceRange[0] || effectivePrice > priceRange[1]) return false;
      }
      return true;
    });

    // Ordenação
    const sorted = [...filtered];
    switch (sortBy) {
      case 'price_asc':
        sorted.sort((a, b) => {
          const pa = a.on_sale && a.sale_price ? a.sale_price : a.price;
          const pb = b.on_sale && b.sale_price ? b.sale_price : b.price;
          return pa - pb;
        });
        break;
      case 'price_desc':
        sorted.sort((a, b) => {
          const pa = a.on_sale && a.sale_price ? a.sale_price : a.price;
          const pb = b.on_sale && b.sale_price ? b.sale_price : b.price;
          return pb - pa;
        });
        break;
      case 'newest':
        sorted.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        break;
      case 'name_asc':
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        break;
    }
    return sorted;
  }, [products, searchQuery, selectedBrands, selectedPounds, selectedSizes, selectedSubcategories, priceRange, sortBy]);

  const priceFilterActive = priceRange !== null && (priceRange[0] !== minPrice || priceRange[1] !== maxPrice);
  const totalActiveFilters =
    selectedBrands.length +
    selectedPounds.length +
    selectedSizes.length +
    selectedSubcategories.length +
    (priceFilterActive ? 1 : 0);

  const clearAllFilters = () => {
    setSelectedBrands([]);
    setSelectedPounds([]);
    setSelectedSizes([]);
    setSelectedSubcategories([]);
    setPriceRange([minPrice, maxPrice]);
  };

  const hasAnyAttribute =
    brandOptions.length + poundOptions.length + sizeOptions.length + subcategoryOptions.length > 0
    || maxPrice > minPrice;

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
      {/* Spacer to compensate fixed Header height */}
      <div aria-hidden className="h-16 lg:h-[108px]" />

      {/* Commercial header banner — compacto no mobile */}
      <div className="bg-foreground text-background">
        <div className="container mx-auto py-4 sm:py-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4">
            <div>
              <p className="text-[10px] sm:text-xs font-bold text-primary-glow uppercase tracking-wider mb-1 sm:mb-2">
                {filteredProducts.length} {filteredProducts.length === 1 ? 'produto' : 'produtos'}
              </p>
              <h1 className="text-2xl sm:text-4xl md:text-5xl font-display font-black leading-tight">
                {categoryParam || 'Todos os produtos'}
              </h1>
              <p className="hidden sm:block text-sm sm:text-base text-background/70 mt-2">
                Envio rápido · 10x sem juros · Troca grátis
              </p>
            </div>

            <div className="w-full sm:max-w-xs">
              <Input
                placeholder="🔍 Buscar produto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 sm:h-11 rounded-full bg-background text-foreground border-transparent placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto pt-4 sm:pt-6 pb-8 sm:pb-16">
        {/* Filtros de Categoria Primária — scroll horizontal no mobile */}
        <div className="-mx-4 sm:mx-0 mb-3">
          <div className="flex sm:flex-wrap gap-2 px-4 sm:px-0 overflow-x-auto sm:overflow-visible scrollbar-hide pb-1 sm:pb-0">
            <button
              onClick={() => handleCategoryChange('')}
              className={`flex-shrink-0 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                categoryParam === ''
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-muted text-foreground hover:bg-muted/70'
              }`}
            >
              Todas
            </button>
            {primaries.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.name)}
                className={`flex-shrink-0 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                  categoryParam === cat.name
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-muted text-foreground hover:bg-muted/70'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Sub-filtros (subcategorias da primária selecionada) */}
        {(() => {
          const activePrimary = primaries.find(p => p.name === categoryParam);
          const subs = activePrimary ? getSubcategoriesOf(activePrimary.id) : [];
          if (subs.length === 0) return null;
          return (
            <div className="-mx-4 sm:mx-0 mb-4 sm:mb-6">
              <div className="flex sm:flex-wrap gap-2 px-4 sm:px-0 overflow-x-auto sm:overflow-visible scrollbar-hide pb-1 sm:pb-0">
                <button
                  onClick={() => handleSubcategoryChange('')}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                    subcategoryParam === ''
                      ? 'bg-foreground text-background'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  Todas em {activePrimary!.name}
                </button>
                {subs.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => handleSubcategoryChange(sub.name)}
                    className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                      subcategoryParam === sub.name
                        ? 'bg-foreground text-background'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Toolbar mobile: Filtros + Ordenação compactos */}
        {(hasAnyAttribute || filteredProducts.length > 0) && (
          <div className="lg:hidden flex items-center gap-2 mb-4">
            {hasAnyAttribute && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full h-9 gap-1.5 relative">
                    <Filter className="w-4 h-4" />
                    Filtros
                    {totalActiveFilters > 0 && (
                      <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                        {totalActiveFilters}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl p-0 flex flex-col">
                  <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
                    <SheetTitle className="text-left text-xl font-display font-bold flex items-center gap-2">
                      <SlidersHorizontal className="w-5 h-5" />
                      Filtros
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    {maxPrice > minPrice && priceRange && (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Faixa de preço
                        </p>
                        <Slider
                          min={minPrice}
                          max={maxPrice}
                          step={1}
                          value={priceRange}
                          onValueChange={(v) => setPriceRange([v[0], v[1]] as [number, number])}
                          className="mt-2"
                        />
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>R$ {priceRange[0].toFixed(2)}</span>
                          <span>R$ {priceRange[1].toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                    {!subcategoryParam &&
                      renderFilterGroup('Subcategoria', subcategoryOptions, selectedSubcategories, setSelectedSubcategories)}
                    {brandOptions.length > 0 &&
                      renderFilterGroup('Marca', brandOptions, selectedBrands, setSelectedBrands)}
                    {poundOptions.length > 0 &&
                      renderFilterGroup('Libragem', poundOptions, selectedPounds, setSelectedPounds)}
                    {sizeOptions.length > 0 &&
                      renderFilterGroup('Tamanho', sizeOptions, selectedSizes, setSelectedSizes)}
                  </div>
                  <SheetFooter className="px-5 py-4 border-t border-border flex-row gap-2 sm:flex-row">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-full"
                      onClick={clearAllFilters}
                      disabled={totalActiveFilters === 0}
                    >
                      Limpar
                    </Button>
                    <Button className="flex-1 rounded-full" asChild>
                      <button type="button" onClick={() => (document.activeElement as HTMLElement)?.blur()}>
                        Ver {filteredProducts.length} produtos
                      </button>
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            )}

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="h-9 rounded-full flex-1 max-w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Nome (A-Z)</SelectItem>
                <SelectItem value="price_asc">Menor preço</SelectItem>
                <SelectItem value="price_desc">Maior preço</SelectItem>
                <SelectItem value="newest">Mais novos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar de Filtros — Desktop only */}
          {hasAnyAttribute && (
            <aside className="hidden lg:block lg:w-64 lg:shrink-0">
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

                {/* Faixa de preço */}
                {maxPrice > minPrice && priceRange && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Faixa de preço
                    </p>
                    <Slider
                      min={minPrice}
                      max={maxPrice}
                      step={1}
                      value={priceRange}
                      onValueChange={(v) => setPriceRange([v[0], v[1]] as [number, number])}
                      className="mt-2"
                    />
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>R$ {priceRange[0].toFixed(2)}</span>
                      <span>R$ {priceRange[1].toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {!subcategoryParam &&
                  renderFilterGroup('Subcategoria', subcategoryOptions, selectedSubcategories, setSelectedSubcategories)}
                {brandOptions.length > 0 &&
                  renderFilterGroup('Marca', brandOptions, selectedBrands, setSelectedBrands)}
                {poundOptions.length > 0 &&
                  renderFilterGroup('Libragem', poundOptions, selectedPounds, setSelectedPounds)}
                {sizeOptions.length > 0 &&
                  renderFilterGroup('Tamanho', sizeOptions, selectedSizes, setSelectedSizes)}

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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <div className="aspect-square w-full rounded-xl bg-muted animate-pulse" />
                    <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                    <div className="h-8 w-full rounded-lg bg-muted animate-pulse mt-1" />
                  </div>
                ))}
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
                {/* Toolbar desktop (mobile usa a toolbar acima) */}
                <div className="hidden lg:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <p className="text-sm text-muted-foreground">
                    {filteredProducts.length} {filteredProducts.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">Ordenar por:</span>
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                      <SelectTrigger className="w-[200px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name_asc">Nome (A-Z)</SelectItem>
                        <SelectItem value="price_asc">Menor preço</SelectItem>
                        <SelectItem value="price_desc">Maior preço</SelectItem>
                        <SelectItem value="newest">Mais novos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
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
