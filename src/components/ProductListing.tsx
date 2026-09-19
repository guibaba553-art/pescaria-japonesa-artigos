import { Helmet } from 'react-helmet-async';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SlidersHorizontal, Filter, X, ArrowLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { fuzzySearch } from '@/lib/fuzzySearch';

import { useToast } from '@/hooks/use-toast';
import { useCart } from '@/hooks/useCart';
import { useProductQuantity } from '@/hooks/useProductQuantity';
import { Product } from '@/types/product';
import { effectiveProductOrVariationPrice, isPromoActive } from '@/utils/promoPrice';
import { useProductsRealtime } from '@/hooks/useProductsRealtime';
import { ProductCard } from '@/components/ProductCard';
import { useCategories } from '@/hooks/useCategories';
import { filterProductsByFacets } from '@/utils/progressiveProductFilters';

type SortOption = 'name_asc' | 'price_asc' | 'price_desc' | 'newest';
type FilterStep = 'category' | 'brand' | 'characteristics';

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
  const [groupMemberships, setGroupMemberships] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParam);

  // Sincroniza o input com o parâmetro de URL quando muda (ex: nova busca pelo header)
  useEffect(() => {
    setSearchQuery(searchParam);
  }, [searchParam]);
  const { primaries, getDescendantsOf, categories: allCategories } = useCategories();

  // Subcategorias selecionadas (podem ser várias do mesmo nível)
  const selectedSubs = useMemo(
    () => subcategoryParam.split(',').map((s) => s.trim()).filter(Boolean),
    [subcategoryParam]
  );

  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedPounds, setSelectedPounds] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);
  const [priceMinInput, setPriceMinInput] = useState('');
  const [priceMaxInput, setPriceMaxInput] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name_asc');
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [filterStep, setFilterStep] = useState<FilterStep>('category');
  const { toast } = useToast();
  const { addItem } = useCart();
  const { getQuantity, setQuantity, incrementQuantity, decrementQuantity } = useProductQuantity();
  const fetchGen = useRef(0);
  const priceManuallySetRef = useRef(false);

  useEffect(() => {
    loadProducts(categoryParam, subcategoryParam);
  }, [categoryParam, subcategoryParam]);

  // Recarrega produtos quando as categorias terminarem de carregar, pois
  // a query hierárquica depende da árvore de categorias.
  useEffect(() => {
    if (allCategories.length) {
      loadProducts(categoryParam, subcategoryParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCategories.length]);

  useProductsRealtime(() => loadProducts(categoryParam, subcategoryParam), 'products-list');

  // Reset filters quando muda a categoria principal (mantém a marca ao navegar nas subcategorias)
  useEffect(() => {
    setSelectedBrands([]);
    setSelectedPounds([]);
    setSelectedSizes([]);
    setPriceRange(null);
    setPriceMinInput('');
    setPriceMaxInput('');
    priceManuallySetRef.current = false;
  }, [categoryParam]);


  const loadProducts = async (cat?: string, subcat?: string) => {
    const gen = ++fetchGen.current;
    setLoading(true);
    const category = cat ?? '';
    const subcategory = subcat ?? '';
    try {
      let query = supabase
        .from('products')
        .select(`
          id, name, price, sale_price, on_sale, sale_starts_at, sale_ends_at, sale_limit_qty, sale_sold_qty, sale_channel, min_sale_price,
          category, subcategory, brand_id, brands(name), pound_test, size,
          image_url, stock, rating, featured, minimum_quantity,
          sold_by_weight, created_at,
          variations:product_variations(id, name, price, stock, image_url, on_sale, sale_price, sale_starts_at, sale_ends_at, sale_limit_qty, sale_sold_qty, sale_channel, min_sale_price)
        `)
        .eq('pdv_only', false)
        .gt('stock', 0)
        .order('name', { ascending: true })
        .limit(10000);

      if (category) query = query.eq('category', category);

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
        const mapped = (data || []).map((row: any) => ({
          ...row,
          brand: row.brands?.name ?? row.brand ?? null,
        }));
        const memberships = new Map<string, Set<string>>();
        const productIds = mapped.map((product) => product.id);
        if (productIds.length) {
          const { data: links } = await supabase
            .from('product_categories')
            .select('product_id, category_id')
            .in('product_id', productIds)
            .limit(20000);
          (links || []).forEach((link: any) => {
            const current = memberships.get(link.product_id) ?? new Set<string>();
            current.add(link.category_id);
            memberships.set(link.product_id, current);
          });
        }
        mapped.forEach((product) => {
          const legacyCategory = allCategories.find((category) => category.name === product.subcategory);
          if (!legacyCategory) return;
          const current = memberships.get(product.id) ?? new Set<string>();
          current.add(legacyCategory.id);
          memberships.set(product.id, current);
        });
        setGroupMemberships(memberships);
        setProducts(mapped as unknown as Product[]);
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

  const categoryTree = useMemo(() => {
    const primary = primaries.find((p) => p.name === categoryParam);
    if (!primary) return [] as Array<{ name: string; depth: number; parentName: string | null }>;
    return getDescendantsOf(primary.id).map((c) => ({
      name: c.name,
      depth: c.depth,
      parentName: allCategories.find((x) => x.id === c.parent_id)?.name ?? null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaries, allCategories, categoryParam]);

  const selectedGroupIds = useMemo(() => selectedSubs
    .map((name) => allCategories.find((category) => category.name === name)?.id)
    .filter((id): id is string => Boolean(id)), [selectedSubs, allCategories]);

  const productsMatchingCurrentFacets = useMemo(() => filterProductsByFacets(products, {
    brands: selectedBrands,
    pounds: selectedPounds,
    sizes: selectedSizes,
    groupIds: selectedGroupIds,
  }, groupMemberships), [products, selectedBrands, selectedPounds, selectedSizes, selectedGroupIds, groupMemberships]);

  const { brandOptions, poundOptions, sizeOptions, groupOptions } = useMemo(() => {
    const brands = new Set<string>();
    const pounds = new Set<string>();
    const sizes = new Set<string>();
    products.forEach(p => {
      if (p.brand) brands.add(p.brand);
    });
    const characteristicProducts = filterProductsByFacets(products, {
      brands: selectedBrands,
      pounds: [],
      sizes: [],
      groupIds: [],
    }, groupMemberships);
    characteristicProducts.forEach(p => {
      if (p.pound_test) pounds.add(p.pound_test);
      if (p.size) sizes.add(p.size);
    });
    const groupCandidateIds = new Set(filterProductsByFacets(products, {
      brands: selectedBrands,
      pounds: selectedPounds,
      sizes: selectedSizes,
      groupIds: [],
    }, groupMemberships).map((product) => product.id));
    const sorter = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
    return {
      brandOptions: Array.from(brands).sort(sorter),
      poundOptions: Array.from(pounds).sort(sorter),
      sizeOptions: Array.from(sizes).sort(sorter),
      groupOptions: categoryTree
        .map((category) => ({ ...category, id: allCategories.find((item) => item.name === category.name)?.id ?? '' }))
        .filter((category) => category.id)
        .filter((category) => selectedSubs.includes(category.name) || Array.from(groupMemberships.entries()).some(
          ([productId, groups]) => groupCandidateIds.has(productId) && groups.has(category.id),
        ))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true })),
    };
  }, [products, categoryTree, allCategories, selectedBrands, selectedPounds, selectedSizes, selectedSubs, groupMemberships]);

  const applySubs = (subs: string[]) => {
    if (subs.length) {
      setSearchParams({ category: categoryParam, subcategory: subs.join(',') });
    } else if (categoryParam) {
      setSearchParams({ category: categoryParam });
    } else {
      setSearchParams({});
    }
  };

  const handleGroupClick = (name: string) => {
    if (!categoryParam) return;
    applySubs(selectedSubs.includes(name) ? selectedSubs.filter((item) => item !== name) : [...selectedSubs, name]);
  };



  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  };

  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const matches = fuzzySearch(
      products,
      searchQuery,
      (p: any) => [
        p.name,
        p.brand,
        p.sku,
        p.subcategory,
        p.category,
        p.short_description,
        p.description,
      ]
    );
    return new Set(matches.map((p: any) => p.id));
  }, [products, searchQuery]);

  const filteredProducts = useMemo(() => {
    const filtered = productsMatchingCurrentFacets.filter(p => {
      if (searchMatchIds && !searchMatchIds.has(p.id)) return false;
      const hasActiveVariationPromo = p.variations?.some((variation) => isPromoActive(variation)) ?? false;
      if (onSaleParam === 'true' && !isPromoActive(p) && !hasActiveVariationPromo) return false;
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
  }, [productsMatchingCurrentFacets, searchMatchIds, priceRange, sortBy, onSaleParam]);

  const priceFilterActive = priceRange !== null && (priceRange[0] !== minPrice || priceRange[1] !== maxPrice);
  const totalActiveFilters =
    selectedBrands.length +
    selectedPounds.length +
    selectedSizes.length +
    selectedSubs.length +
    (priceFilterActive ? 1 : 0);

  const clearAllFilters = () => {
    setSelectedBrands([]);
    setSelectedPounds([]);
    setSelectedSizes([]);
    if (categoryParam) {
      setSearchParams({ category: categoryParam });
    } else {
      setSearchParams({});
    }
    setPriceRange([minPrice, maxPrice]);
    setPriceMinInput('');
    setPriceMaxInput('');
    priceManuallySetRef.current = false;
  };

  const hasAnyAttribute = primaries.length + brandOptions.length + poundOptions.length + sizeOptions.length + groupOptions.length > 0
    || maxPrice > minPrice;

  const handleApplyPrice = () => {
    if (!priceRange) return;
    priceManuallySetRef.current = true;
    const rawMin = priceMinInput.replace(/[^0-9]/g, '');
    const rawMax = priceMaxInput.replace(/[^0-9]/g, '');
    const appliedMin = rawMin === '' ? minPrice : Math.max(minPrice, Math.min(maxPrice, Number(rawMin)));
    const appliedMax = rawMax === '' ? maxPrice : Math.max(minPrice, Math.min(maxPrice, Number(rawMax)));
    setPriceRange([Math.min(appliedMin, appliedMax), Math.max(appliedMin, appliedMax)]);
  };

  const handleClearPrice = () => {
    setPriceMinInput('');
    setPriceMaxInput('');
    setPriceRange([minPrice, maxPrice]);
    priceManuallySetRef.current = false;
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
    setSelected: (v: string[]) => void,
    labels?: Record<string, string>
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
                {labels?.[opt] ?? opt}
              </button>
            );
          })}

        </div>
      </div>
    );
  };

  const activeFilterChips = [
    ...(categoryParam ? [{ key: 'category', label: categoryParam, remove: () => handleCategoryChange('') }] : []),
    ...selectedBrands.map((value) => ({ key: `brand-${value}`, label: value, remove: () => toggle(selectedBrands, setSelectedBrands, value) })),
    ...selectedPounds.map((value) => ({ key: `pound-${value}`, label: value, remove: () => toggle(selectedPounds, setSelectedPounds, value) })),
    ...selectedSizes.map((value) => ({ key: `size-${value}`, label: value, remove: () => toggle(selectedSizes, setSelectedSizes, value) })),
    ...selectedSubs.map((value) => ({ key: `group-${value}`, label: value, remove: () => handleGroupClick(value) })),
  ];

  const renderChoiceGrid = (options: string[], selected: string[], onClick: (value: string) => void) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <Button
            key={option}
            type="button"
            variant={active ? 'default' : 'outline'}
            className="h-auto min-h-11 justify-between whitespace-normal text-left"
            onClick={() => onClick(option)}
          >
            <span>{option}</span>
            {active ? <X /> : <ChevronRight />}
          </Button>
        );
      })}
    </div>
  );

  const filterStepTitle = filterStep === 'category'
    ? 'Escolha uma categoria'
    : filterStep === 'brand'
      ? 'Escolha a marca'
      : 'Combine as características';


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
        {(hasAnyAttribute || filteredProducts.length > 0) && (
          <div className="flex flex-col gap-3 mb-6">
            <div className="flex items-center gap-2">
            {hasAnyAttribute && (
              <Dialog open={filterDialogOpen} onOpenChange={(open) => {
                setFilterDialogOpen(open);
                if (open) setFilterStep('category');
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full h-9 gap-1.5 relative">
                    <Filter className="w-4 h-4" />
                    Filtros
                    {totalActiveFilters > 0 && (
                      <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                        {totalActiveFilters}
                      </span>
                    )}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0 gap-0">
                  <DialogHeader className="px-5 pt-5 pb-4 border-b border-border text-left">
                    <div className="flex items-center gap-2">
                      {filterStep !== 'category' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Voltar"
                          onClick={() => setFilterStep(filterStep === 'characteristics' ? 'brand' : 'category')}
                        >
                          <ArrowLeft />
                        </Button>
                      )}
                    <DialogTitle className="text-xl font-display font-bold flex items-center gap-2">
                      <SlidersHorizontal className="w-5 h-5" />
                      {filterStepTitle}
                    </DialogTitle>
                    </div>
                    <DialogDescription className="text-left">
                      {filterStep === 'category'
                        ? 'Comece pelo tipo de produto que você procura.'
                        : filterStep === 'brand'
                          ? 'Escolha uma ou mais marcas, ou continue sem selecionar.'
                          : 'Estas escolhas são independentes e serão combinadas entre si.'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="overflow-y-auto p-5 space-y-6 min-h-[320px]">
                    {filterStep === 'category' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={!categoryParam && !isOffersActive ? 'default' : 'outline'}
                          className="h-12 justify-between"
                          onClick={() => { handleCategoryChange(''); setFilterStep('brand'); }}
                        >
                          Todos os produtos <ChevronRight />
                        </Button>
                        <Button
                          type="button"
                          variant={isOffersActive ? 'default' : 'outline'}
                          className="h-12 justify-between"
                          onClick={() => { handleOffersClick(); setFilterStep('brand'); }}
                        >
                          Ofertas <ChevronRight />
                        </Button>
                        {primaries.map((category) => (
                          <Button
                            key={category.id}
                            type="button"
                            variant={categoryParam === category.name ? 'default' : 'outline'}
                            className="h-12 justify-between"
                            onClick={() => { handleCategoryChange(category.name); setFilterStep('brand'); }}
                          >
                            {category.name} <ChevronRight />
                          </Button>
                        ))}
                      </div>
                    )}

                    {filterStep === 'brand' && (
                      <div className="space-y-5">
                        {brandOptions.length > 0
                          ? renderChoiceGrid(brandOptions, selectedBrands, (value) => toggle(selectedBrands, setSelectedBrands, value))
                          : <p className="text-sm text-muted-foreground">Nenhuma marca cadastrada para esta categoria.</p>}
                      </div>
                    )}

                    {filterStep === 'characteristics' && (
                      <div className="space-y-6">
                        {poundOptions.length > 0 && renderFilterGroup('Libragem', poundOptions, selectedPounds, setSelectedPounds)}
                        {sizeOptions.length > 0 && renderFilterGroup('Tamanho', sizeOptions, selectedSizes, setSelectedSizes)}
                        {groupOptions.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outros grupos</p>
                            <div className="flex flex-wrap gap-2">
                              {groupOptions.map((group) => (
                                <Button
                                  key={group.id}
                                  type="button"
                                  size="sm"
                                  variant={selectedSubs.includes(group.name) ? 'default' : 'outline'}
                                  onClick={() => handleGroupClick(group.name)}
                                >
                                  {group.name}{selectedSubs.includes(group.name) && <X />}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                        {renderPriceRangeFilter()}
                      </div>
                    )}
                  </div>

                  <DialogFooter className="px-5 py-4 border-t border-border flex-row gap-2 sm:space-x-0">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={clearAllFilters}
                      disabled={totalActiveFilters === 0}
                    >
                      Limpar
                    </Button>
                    {filterStep === 'brand' ? (
                      <Button className="flex-1" onClick={() => setFilterStep('characteristics')}>
                        Continuar <ChevronRight />
                      </Button>
                    ) : filterStep === 'characteristics' ? (
                      <Button className="flex-1" onClick={() => setFilterDialogOpen(false)}>
                        Ver {filteredProducts.length} produtos
                      </Button>
                    ) : (
                      <Button className="flex-1" disabled>Escolha uma categoria</Button>
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>
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
            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap gap-2" aria-label="Filtros ativos">
                {activeFilterChips.map((chip) => (
                  <Button key={chip.key} variant="secondary" size="sm" className="h-8 rounded-full" onClick={chip.remove}>
                    {chip.label}<X />
                  </Button>
                ))}
              </div>
            )}
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
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full h-9 gap-1.5 relative text-sm font-normal"
                      onClick={() => { setFilterStep('category'); setFilterDialogOpen(true); }}
                    >
                      <Filter className="w-4 h-4" />
                      Filtros
                      {totalActiveFilters > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold ml-0.5">
                          {totalActiveFilters}
                        </span>
                      )}
                    </Button>
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
