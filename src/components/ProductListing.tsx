import { Helmet } from 'react-helmet-async';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SlidersHorizontal, Filter } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCart } from '@/hooks/useCart';
import { useProductQuantity } from '@/hooks/useProductQuantity';
import { Product } from '@/types/product';
import { effectiveProductOrVariationPrice, isPromoActive } from '@/utils/promoPrice';
import { useProductsRealtime } from '@/hooks/useProductsRealtime';
import { ProductCard } from '@/components/ProductCard';
import { useCategories } from '@/hooks/useCategories';

type SortOption = 'name_asc' | 'price_asc' | 'price_desc' | 'newest';

export interface ProductListingProps {
  /** Título exibido no cabeçalho da página (ex: "Ofertas") */
  defaultTitle?: string;
  /** Quando true, filtra apenas produtos com on_sale = true */
  forceOnSale?: boolean;
  /** Slug usado no canonical URL (ex: "ofertas") */
  canonicalSlug?: string;
}

export function ProductListing({
  defaultTitle = 'Todos os produtos',
  forceOnSale = false,
  canonicalSlug,
}: ProductListingProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category') || '';
  const subcategoryParam = searchParams.get('subcategory') || '';
  const searchParam = searchParams.get('search') || '';
  const onSaleParam = forceOnSale ? 'true' : searchParams.get('on_sale');
  const isOffersActive = onSaleParam === 'true';
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
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);
  const [priceMinInput, setPriceMinInput] = useState('');
  const [priceMaxInput, setPriceMaxInput] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name_asc');
  const [pricePopoverOpen, setPricePopoverOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const { toast } = useToast();
  const { addItem } = useCart();
  const { getQuantity, setQuantity, incrementQuantity, decrementQuantity } = useProductQuantity();
  const fetchGen = useRef(0);
  const priceManuallySetRef = useRef(false);

  useEffect(() => {
    loadProducts(categoryParam, subcategoryParam);
  }, [categoryParam, subcategoryParam]);

  useProductsRealtime(() => loadProducts(categoryParam, subcategoryParam), 'products-list');

  // Reset filters quando muda categoria
  useEffect(() => {
    setSelectedBrands([]);
    setSelectedPounds([]);
    setSelectedSubcategories([]);
    setPriceRange(null);
    setPriceMinInput('');
    setPriceMaxInput('');
    priceManuallySetRef.current = false;
  }, [categoryParam, subcategoryParam]);

  const loadProducts = async (cat?: string, subcat?: string) => {
    const gen = ++fetchGen.current;
    setLoading(true);
    const category = cat ?? '';
    const subcategory = subcat ?? '';
    try {
      let query = supabase
        .from('products')
        .select(`
          id, name, price, sale_price, on_sale, sale_ends_at, sale_limit_qty, sale_sold_qty, min_sale_price,
          category, subcategory, brand, pound_test, size,
          image_url, stock, rating, featured, minimum_quantity,
          sold_by_weight, created_at,
          variations:product_variations(id, name, price, stock, image_url, on_sale, sale_price, sale_ends_at, sale_limit_qty, sale_sold_qty, min_sale_price)
        `)
        .eq('pdv_only', false)
        .gt('stock', 0)
        .order('name', { ascending: true })
        .limit(10000);

      if (category) query = query.eq('category', category);
      if (subcategory) query = query.eq('subcategory', subcategory);

      let result = await query;
      for (let attempt = 0; attempt < 2 && result.error && /failed to fetch|networkerror|load failed/i.test(result.error.message || ''); attempt++) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        result = await query;
      }
      const { data, error } = result;

      // Se uma chamada mais nova já foi feita, descarta este resultado obsoleto
      if (gen !== fetchGen.current) return;

      if (error) {
        if (/failed to fetch|networkerror|load failed/i.test(error.message || '')) {
          console.warn('[Products] rede instável:', error.message);
        } else {
          toast({ title: 'Erro ao carregar produtos', description: error.message, variant: 'destructive' });
        }
      } else {
        setProducts((data || []) as unknown as Product[]);
      }
    } catch (err) {
      // Garante que loading=false mesmo se a promise rejeitar
      console.warn('[Products] exceção ao carregar:', err);
    } finally {
      if (gen === fetchGen.current) {
        setLoading(false);
      }
    }
  };

  const handleCategoryChange = (category: string) => {
    setSearchParams(category ? { category } : {});
  };

  const handleOffersClick = () => {
    setSearchParams({ on_sale: 'true' });
  };

  const handleSubcategoryChange = (subcategory: string) => {
    if (!categoryParam) return;
    setSearchParams(subcategory ? { category: categoryParam, subcategory } : { category: categoryParam });
  };

  const { minPrice, maxPrice } = useMemo(() => {
    if (products.length === 0) return { minPrice: 0, maxPrice: 0 };
    let min = Infinity;
    let max = -Infinity;
    for (const p of products) {
      const price = effectiveProductOrVariationPrice(p as any);
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

  // Inicializa / sincroniza o range de preço quando produtos mudam
  useEffect(() => {
    if (products.length > 0 && !priceManuallySetRef.current) {
      setPriceRange([minPrice, maxPrice]);
    }
  }, [products, minPrice, maxPrice]);

  // Opções dinâmicas a partir dos produtos carregados
  const { brandOptions, poundOptions, subcategoryOptions } = useMemo(() => {
    const brands = new Set<string>();
    const pounds = new Set<string>();
    const subs = new Set<string>();
    products.forEach(p => {
      if (p.brand) brands.add(p.brand);
      if (p.pound_test) pounds.add(p.pound_test);
      if (p.subcategory) subs.add(p.subcategory);
    });
    const sorter = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
    return {
      brandOptions: Array.from(brands).sort(sorter),
      poundOptions: Array.from(pounds).sort(sorter),
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
      if (selectedSubcategories.length && (!p.subcategory || !selectedSubcategories.includes(p.subcategory))) return false;
      if (onSaleParam === 'true' && !isPromoActive(p)) return false;
      if (priceRange) {
        const effectivePrice = effectiveProductOrVariationPrice(p as any);
        if (effectivePrice < priceRange[0] || effectivePrice > priceRange[1]) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    switch (sortBy) {
      case 'price_asc':
        sorted.sort((a, b) => {
          const pa = effectiveProductOrVariationPrice(a as any);
          const pb = effectiveProductOrVariationPrice(b as any);
          return pa - pb;
        });
        break;
      case 'price_desc':
        sorted.sort((a, b) => {
          const pa = effectiveProductOrVariationPrice(a as any);
          const pb = effectiveProductOrVariationPrice(b as any);
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
  }, [products, searchQuery, selectedBrands, selectedPounds, selectedSubcategories, priceRange, sortBy, onSaleParam]);

  const priceFilterActive = priceRange !== null && (priceRange[0] !== minPrice || priceRange[1] !== maxPrice);
  const totalActiveFilters =
    selectedBrands.length +
    selectedPounds.length +
    selectedSubcategories.length +
    (priceFilterActive ? 1 : 0);

  const clearAllFilters = () => {
    setSelectedBrands([]);
    setSelectedPounds([]);
    setSelectedSubcategories([]);
    setPriceRange([minPrice, maxPrice]);
    setPriceMinInput('');
    setPriceMaxInput('');
    priceManuallySetRef.current = false;
  };

  const hasAnyAttribute =
    brandOptions.length + poundOptions.length + subcategoryOptions.length > 0
    || maxPrice > minPrice;

  const handleApplyPrice = () => {
    if (!priceRange) return;
    priceManuallySetRef.current = true;
    const rawMin = priceMinInput.replace(/[^0-9]/g, '');
    const rawMax = priceMaxInput.replace(/[^0-9]/g, '');
    const appliedMin = rawMin === '' ? minPrice : Math.max(minPrice, Math.min(maxPrice, Number(rawMin)));
    const appliedMax = rawMax === '' ? maxPrice : Math.max(minPrice, Math.min(maxPrice, Number(rawMax)));
    setPriceRange([Math.min(appliedMin, appliedMax), Math.max(appliedMin, appliedMax)]);
    setPricePopoverOpen(false);
    setMobileSheetOpen(false);
  };

  const handleClearPrice = () => {
    setPriceMinInput('');
    setPriceMaxInput('');
    setPriceRange([minPrice, maxPrice]);
    priceManuallySetRef.current = false;
    setPricePopoverOpen(false);
    setMobileSheetOpen(false);
  };

  const renderPriceRangeFilter = () => {
    if (maxPrice <= minPrice || !priceRange) return null;
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Faixa de preço
        </p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none select-none">
              R$
            </span>
            <Input
              type="text"
              inputMode="numeric"
              value={priceMinInput}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                setPriceMinInput(raw);
              }}
              placeholder={`${Math.floor(minPrice)}`}
              className="pl-9 h-9 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <span className="text-muted-foreground text-xs shrink-0">—</span>
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none select-none">
              R$
            </span>
            <Input
              type="text"
              inputMode="numeric"
              value={priceMaxInput}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                setPriceMaxInput(raw);
              }}
              placeholder={`${Math.ceil(maxPrice)}`}
              className="pl-9 h-9 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 rounded-full h-8 text-xs"
            onClick={handleClearPrice}
          >
            Limpar
          </Button>
          <Button
            size="sm"
            className="flex-1 rounded-full h-8 text-xs"
            onClick={handleApplyPrice}
          >
            Aplicar
          </Button>
        </div>
      </div>
    );
  };

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

  const displayTitle = isOffersActive
    ? 'Todas as ofertas'
    : categoryParam
      ? `Tudo em ${categoryParam}`
      : defaultTitle;

  const pageTitle = isOffersActive
    ? `Todas as ofertas — JAPAS Pesca${categoryParam ? ` (${categoryParam})` : ''}`
    : categoryParam
      ? `${categoryParam} — JAPAS Pesca`
      : `${defaultTitle} — JAPAS Pesca`;

  const pageDescription = isOffersActive
    ? `Confira as melhores ofertas de artigos de pesca na JAPAS Pesca: varas, molinetes, iscas e muito mais com preços imperdíveis.`
    : categoryParam
      ? `${categoryParam} na JAPAS Pesca: confira preços, marcas e especificações com entrega para todo o Brasil.`
      : 'Catálogo completo de artigos de pesca: varas, molinetes, iscas, anzóis, linhas e acessórios. Filtre por categoria, marca e preço.';

  const canonicalPath = categoryParam
    ? `/produtos?category=${encodeURIComponent(categoryParam)}${isOffersActive ? '&on_sale=true' : ''}`
    : isOffersActive
      ? '/produtos?on_sale=true'
      : '/produtos';

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link
          rel="canonical"
          href={`https://japaspesca.com.br${canonicalPath}`}
        />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content="Artigos de pesca com entrega para todo o Brasil." />
        <meta property="og:url" content={`https://japaspesca.com.br${canonicalPath}`} />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: displayTitle,
          url: `https://japaspesca.com.br${canonicalPath}`,
          isPartOf: { "@type": "WebSite", name: 'JAPAS Pesca', url: 'https://japaspesca.com.br' },
        })}</script>
      </Helmet>
      <Header />
      {/* Spacer to compensate fixed Header height */}
      <div aria-hidden className="h-16 lg:h-[108px]" />

      {/* Commercial header banner */}
      <div className="bg-foreground text-background">
        <div className="container mx-auto py-4 sm:py-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4">
            <div>
              <p className="text-[10px] sm:text-xs font-bold text-primary-glow uppercase tracking-wider mb-1 sm:mb-2">
                {filteredProducts.length} {isOffersActive ? (filteredProducts.length === 1 ? 'oferta' : 'ofertas') : (filteredProducts.length === 1 ? 'produto' : 'produtos')}
              </p>
              <h1 className="text-2xl sm:text-4xl md:text-5xl font-display font-black leading-tight">
                {displayTitle}
              </h1>
              <p className="hidden sm:block text-sm sm:text-base text-background/70 mt-2">
                {isOffersActive
                  ? 'Ofertas imperdíveis por tempo limitado'
                  : 'Os melhores preços em artigos de pesca, com entrega para todo o Brasil.'}
              </p>
            </div>

            <div className="w-full sm:max-w-xs lg:hidden">
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
        {/* Category filters */}
        <div className="-mx-4 sm:mx-0 mb-4">
          <div className="flex sm:flex-wrap gap-3 px-4 sm:px-0 overflow-x-auto sm:overflow-visible scrollbar-hide pb-2 sm:pb-1">
            <button
              onClick={() => handleCategoryChange('')}
              className={`flex-shrink-0 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                categoryParam === '' && onSaleParam !== 'true'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-muted text-foreground hover:bg-muted/70'
              }`}
            >
              Todas
            </button>
            <button
              onClick={handleOffersClick}
              className={`flex-shrink-0 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                onSaleParam === 'true'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-muted text-foreground hover:bg-muted/70'
              }`}
            >
              Ofertas
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

        {(hasAnyAttribute || filteredProducts.length > 0) && (
          <div className="lg:hidden flex items-center gap-2 mb-4">
            {hasAnyAttribute && (
              <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
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
                    {renderPriceRangeFilter()}
                    {!subcategoryParam &&
                      renderFilterGroup('Subcategoria', subcategoryOptions, selectedSubcategories, setSelectedSubcategories)}
                    {brandOptions.length > 0 &&
                      renderFilterGroup('Marca', brandOptions, selectedBrands, setSelectedBrands)}
                    {poundOptions.length > 0 &&
                      renderFilterGroup('Libragem', poundOptions, selectedPounds, setSelectedPounds)}
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

        <div className="flex flex-col gap-8">
          {/* Product grid */}
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
                  {isOffersActive
                    ? 'Nenhuma oferta encontrada com esses filtros.'
                    : 'Nenhum produto encontrado com esses filtros.'}
                </p>
                {totalActiveFilters > 0 && (
                  <Button variant="outline" className="mt-4" onClick={clearAllFilters}>
                    Limpar filtros
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Toolbar desktop */}
                <div className="hidden lg:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-1 mb-4">
                  <p className="text-sm text-muted-foreground shrink-0">
                    {filteredProducts.length} {filteredProducts.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="relative hidden lg:block">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none select-none text-sm">🔍</span>
                      <Input
                        placeholder="Buscar produto..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 w-96 text-sm rounded-full bg-muted/50 border-border/50"
                      />
                    </div>
                    {priceRange && maxPrice > minPrice && (
                      <Popover open={pricePopoverOpen} onOpenChange={setPricePopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full h-9 gap-1.5 relative text-sm font-normal"
                          >
                            <Filter className="w-4 h-4" />
                            Filtros
                            {totalActiveFilters > 0 && (
                              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold ml-0.5">
                                {totalActiveFilters}
                              </span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-64 p-4">
                          {renderPriceRangeFilter()}
                        </PopoverContent>
                      </Popover>
                    )}
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
                          price: effectiveProductOrVariationPrice(product as any),
                          image_url: product.image_url
                        }, qty);
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
