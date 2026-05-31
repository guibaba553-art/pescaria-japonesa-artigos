import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useProductVariations } from '@/hooks/useProductVariations';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Package, Plus, Search, X, ShoppingBasket, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AddToPurchaseListDialog } from '@/components/AddToPurchaseListDialog';
import { PanelHeader } from '@/components/admin/PanelHeader';
import { ProductEdit } from '@/components/ProductEdit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProductsRealtime } from '@/hooks/useProductsRealtime';
import { Switch } from '@/components/ui/switch';
import { useCategories } from '@/hooks/useCategories';
import { ProductVariations } from '@/components/ProductVariations';
import { SubcategorySelect } from '@/components/SubcategorySelect';
import { validateProductForm } from '@/utils/productValidation';
import { useSalesVelocity } from '@/hooks/useSalesVelocity';
import { ImageThumbWithBgRemoval } from '@/components/ImageThumbWithBgRemoval';
import { BarcodeInput } from '@/components/BarcodeInput';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftRestoreBanner } from '@/components/DraftRestoreBanner';
import { normalizeProductImage } from '@/utils/normalizeProductImage';
import { upscaleImage } from '@/utils/upscaleImage';
import { parseOptionalMeasurementInput } from '@/utils/productMeasurements';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  price_pdv?: number | null;
  category: string;
  image_url: string | null;
  images: string[];
  stock: number;
  rating: number;
  featured: boolean;
  on_sale: boolean;
  sale_price?: number;
  sale_ends_at?: string;
  minimum_quantity?: number;
  sku?: string | null;
  weight_grams?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  pdv_only?: boolean;
  supplier_id?: string | null;
}

interface SupplierOpt { id: string; name: string; }

type DimsCheck = Pick<Product, 'weight_grams' | 'length_cm' | 'width_cm' | 'height_cm'>;

function hasFullDims(p: { weight_grams?: number | null; length_cm?: number | null; width_cm?: number | null; height_cm?: number | null }): boolean {
  return !!(p.weight_grams && p.length_cm && p.width_cm && p.height_cm);
}

// Produto está "sem medidas" para frete quando não tem medidas próprias
// E nenhuma das suas variações tem medidas completas.
function isMissingShippingDims(
  p: DimsCheck,
  variations?: Array<{ weight_grams?: number | null; length_cm?: number | null; width_cm?: number | null; height_cm?: number | null }>
): boolean {
  if (hasFullDims(p)) return false;
  if (variations && variations.length > 0) {
    // Se ALGUMA variação tem medidas completas, o produto pode ser enviado
    return !variations.some(hasFullDims);
  }
  return true;
}

export function ProductsManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { primaries } = useCategories();
  const [products, setProducts] = useState<Product[]>([]);
  const [stockDiscrepancies, setStockDiscrepancies] = useState<Record<string, number>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [purchaseDialog, setPurchaseDialog] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('');
  const [sku, setSku] = useState('');
  const [minimumQuantity, setMinimumQuantity] = useState('1');
  const [soldByWeight, setSoldByWeight] = useState(false);
  const [pdvOnly, setPdvOnly] = useState(false);
  const [pdvNoMarkup, setPdvNoMarkup] = useState(false);
  const [brand, setBrand] = useState('');
  const [poundTest, setPoundTest] = useState('');
  const [size, setSize] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [upscaleImages, setUpscaleImages] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'in-stock' | 'out-of-stock' | 'on-sale' | 'featured' | 'restock' | 'no-dims' | 'pdv-only'>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const { velocities } = useSalesVelocity({ daysWindow: 60, criticalDays: 7, warningDays: 14 });
  const [shortDescription, setShortDescription] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  // Preço PDV (PIX/Dinheiro). Débito e Crédito são calculados pela fórmula fixa.
  const [pricePdv, setPricePdv] = useState('');
  // Overrides manuais por método (vazio = usa fórmula automática)
  const [pricePdvPix, setPricePdvPix] = useState('');
  const [pricePdvCash, setPricePdvCash] = useState('');
  const [pricePdvDebit, setPricePdvDebit] = useState('');
  const [pricePdvCredit, setPricePdvCredit] = useState('');
  // Peso e dimensões para cálculo de frete (Melhor Envio)
  const [weightGrams, setWeightGrams] = useState('');
  const [lengthCm, setLengthCm] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [heightCm, setHeightCm] = useState('');

  const { variations: newProductVariations, setVariations: setNewProductVariations, saveVariations } =
    useProductVariations();

  useEffect(() => {
    loadProducts();
    loadStockDiscrepancies();
    supabase.from('suppliers').select('id, razao_social, nome_fantasia').eq('is_active', true).order('razao_social').then(({ data }) => {
      if (data) setSuppliers((data as any[]).map((s) => ({ id: s.id, name: s.nome_fantasia || s.razao_social })));
    });
  }, []);

  const loadStockDiscrepancies = async () => {
    const { data } = await supabase.rpc('get_products_with_stock_discrepancy');
    if (data) {
      const map: Record<string, number> = {};
      for (const row of data as Array<{ product_id: string; discrepancy_count: number }>) {
        map[row.product_id] = Number(row.discrepancy_count);
      }
      setStockDiscrepancies(map);
    }
  };

  useProductsRealtime(() => loadProducts(), 'products-management');

  const [variationDimsByProduct, setVariationDimsByProduct] = useState<Record<string, Array<{ weight_grams: number | null; length_cm: number | null; width_cm: number | null; height_cm: number | null }>>>({});

  const [variationSummaries, setVariationSummaries] = useState<Record<string, { minPrice: number; totalStock: number }>>({});

  const loadProducts = async () => {
    // Usa RPC para incluir campos sensíveis (custo, preço PDV, margens) visíveis apenas a admin/funcionário
    const [{ data, error }, { data: vData, error: vError }, { data: vaData }] = await Promise.all([
      supabase.rpc('get_products_admin'),
      supabase.from('product_variations').select('product_id, weight_grams, length_cm, width_cm, height_cm'),
      supabase.rpc('get_product_variations_admin'),
    ]);
    if (error) {
      toast({ title: 'Erro ao carregar produtos', description: error.message, variant: 'destructive' });
    } else {
      setProducts((data || []) as any);
    }
    if (!vError && vData) {
      const map: Record<string, Array<{ weight_grams: number | null; length_cm: number | null; width_cm: number | null; height_cm: number | null }>> = {};
      for (const v of vData as any[]) {
        if (!map[v.product_id]) map[v.product_id] = [];
        map[v.product_id].push({
          weight_grams: v.weight_grams,
          length_cm: v.length_cm,
          width_cm: v.width_cm,
          height_cm: v.height_cm,
        });
      }
      setVariationDimsByProduct(map);
    }
    if (vaData) {
      const summary: Record<string, { minPrice: number; totalStock: number }> = {};
      for (const v of vaData as any[]) {
        if (!summary[v.product_id]) {
          summary[v.product_id] = { minPrice: Infinity, totalStock: 0 };
        }
        const vPrice = Number(v.price_pdv ?? v.price ?? 0);
        if (vPrice > 0 && vPrice < summary[v.product_id].minPrice) {
          summary[v.product_id].minPrice = vPrice;
        }
        summary[v.product_id].totalStock += Number(v.stock ?? 0);
      }
      // Replace Infinity with 0 for products with no valid variation prices
      for (const key of Object.keys(summary)) {
        if (!isFinite(summary[key].minPrice)) summary[key].minPrice = 0;
      }
      setVariationSummaries(summary);
    }
  };

  const handleDelete = async (id: string, imageUrl: string | null) => {
    if (!confirm('Tem certeza que deseja deletar este produto?')) return;
    try {
      if (imageUrl) {
        const fileName = imageUrl.split('/').pop();
        if (fileName) await supabase.storage.from('product-images').remove([fileName]);
      }
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      try {
        const dp = products.find((p) => p.id === id);
        await supabase.rpc('log_admin_access', {
          p_action: 'PRODUCT_DELETE', p_table_name: 'products', p_record_id: id,
          p_details: { product_name: dp?.name, category: dp?.category },
        });
      } catch {}
      toast({ title: 'Produto deletado' });
      loadProducts();
    } catch (error: any) {
      toast({ title: 'Erro ao deletar', description: error.message, variant: 'destructive' });
    }
  };

  const getStock = (p: Product) => variationSummaries[p.id]?.totalStock ?? (p.stock || 0);
  const visibleProducts = products.filter((p) => p.category !== 'Pendente Revisão');
  const outOfStock = visibleProducts.filter((p) => getStock(p) === 0).length;
  const onSaleCount = visibleProducts.filter((p) => p.on_sale).length;
  const featuredCount = visibleProducts.filter((p) => p.featured).length;
  const totalStock = visibleProducts.reduce((sum, p) => sum + getStock(p), 0);
  const noDimsCount = visibleProducts.filter((p) => isMissingShippingDims(p, variationDimsByProduct[p.id])).length;
  const pdvOnlyCount = visibleProducts.filter((p) => p.pdv_only).length;

  const restockIds = new Set(
    visibleProducts
      .filter((p) => {
        const v = velocities[p.id];
        return v && (v.status === 'critical' || v.status === 'out_of_stock');
      })
      .map((p) => p.id)
  );

  let filteredProducts = visibleProducts;
  if (filter === 'in-stock') filteredProducts = filteredProducts.filter((p) => getStock(p) > 0);
  if (filter === 'out-of-stock') filteredProducts = filteredProducts.filter((p) => p.stock === 0);
  if (filter === 'on-sale') filteredProducts = filteredProducts.filter((p) => p.on_sale);
  if (filter === 'featured') filteredProducts = filteredProducts.filter((p) => p.featured);
  if (filter === 'restock') filteredProducts = filteredProducts.filter((p) => restockIds.has(p.id));
  if (filter === 'no-dims') filteredProducts = filteredProducts.filter((p) => isMissingShippingDims(p, variationDimsByProduct[p.id]));
  if (filter === 'pdv-only') filteredProducts = filteredProducts.filter((p) => p.pdv_only);
  if (supplierFilter !== 'all') {
    filteredProducts = filteredProducts.filter((p) =>
      supplierFilter === 'none' ? !p.supplier_id : p.supplier_id === supplierFilter
    );
  }
  filteredProducts = filteredProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filterChips: Array<{ key: typeof filter; label: string; count: number }> = [
    { key: 'all', label: 'Todos', count: visibleProducts.length },
    { key: 'in-stock', label: 'Em estoque', count: visibleProducts.length - outOfStock },
    { key: 'out-of-stock', label: 'Esgotados', count: outOfStock },
    { key: 'on-sale', label: 'Promoção', count: onSaleCount },
    { key: 'featured', label: 'Destaque', count: featuredCount },
    { key: 'restock', label: 'Reestoque', count: restockIds.size },
    { key: 'no-dims', label: '⚠ Sem medidas', count: noDimsCount },
    { key: 'pdv-only', label: '🏪 Só PDV', count: pdvOnlyCount },
  ];

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-0 shadow-sm">
        <PanelHeader
          icon={Package}
          title="Produtos Cadastrados"
          description="Gerencie os produtos da loja"
          kpis={[
            { label: 'Total', value: visibleProducts.length },
            { label: 'Estoque total', value: Math.round(Number(totalStock) || 0), tone: 'primary' },
            { label: 'Esgotados', value: outOfStock, tone: 'danger' },
            { label: 'Promoção', value: onSaleCount, tone: 'success' },
            { label: 'Destaque', value: featuredCount, tone: 'warning' },
            { label: 'Sem medidas', value: noDimsCount, tone: 'danger' },
          ]}
        />
        <CardContent className="p-4 md:p-6 space-y-4">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-2 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Procurar por nome, categoria ou SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos fornecedores</SelectItem>
                  <SelectItem value="none">Sem fornecedor</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" /> Novo Produto
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {filterChips.map((c) => (
              <button
                key={c.key}
                onClick={() => setFilter(c.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  filter === c.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/40 hover:bg-muted border-border text-muted-foreground'
                }`}
              >
                {c.label} <span className="opacity-70">({c.count})</span>
              </button>
            ))}
          </div>

          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-xl border border-dashed bg-muted/30">
              <Package className="w-14 h-14 mb-3 opacity-40" />
              <p className="text-sm font-medium">Nenhum produto encontrado</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filteredProducts.map((product) => {
                const v = velocities[product.id];
                const vs = variationSummaries[product.id];
                const hasVars = vs && vs.totalStock > 0;
                const displayPrice = hasVars ? vs.minPrice : Number(product.price_pdv ?? product.price ?? 0);
                const displayStock = hasVars ? vs.totalStock : product.stock;
                const accent =
                  displayStock === 0 ? 'border-l-destructive'
                  : v?.status === 'critical' ? 'border-l-orange-500'
                  : product.on_sale ? 'border-l-emerald-500'
                  : product.featured ? 'border-l-amber-500'
                  : 'border-l-primary/40';

                // Texto da estimativa
                let durationLabel = '';
                let durationClass = 'text-muted-foreground';
                if (product.stock === 0) {
                  durationLabel = 'Esgotado';
                  durationClass = 'text-destructive font-semibold';
                } else if (!v) {
                  durationLabel = 'Sem histórico';
                } else if (v.daysRemaining === null) {
                  durationLabel = 'Sem vendas (60d)';
                } else if (v.daysRemaining < 1) {
                  durationLabel = 'Acaba hoje';
                  durationClass = 'text-destructive font-semibold';
                } else if (v.daysRemaining <= 7) {
                  durationLabel = `~${Math.round(v.daysRemaining)}d restantes`;
                  durationClass = 'text-destructive font-semibold';
                } else if (v.daysRemaining <= 14) {
                  durationLabel = `~${Math.round(v.daysRemaining)}d restantes`;
                  durationClass = 'text-orange-600 dark:text-orange-400 font-semibold';
                } else if (v.daysRemaining <= 60) {
                  durationLabel = `~${Math.round(v.daysRemaining)}d restantes`;
                  durationClass = 'text-emerald-600 dark:text-emerald-400 font-medium';
                } else {
                  durationLabel = `+${Math.round(v.daysRemaining)}d de estoque`;
                  durationClass = 'text-emerald-600 dark:text-emerald-400 font-medium';
                }

                return (
                  <Card key={product.id} className={`border-l-4 ${accent} overflow-hidden transition-all hover:shadow-md flex flex-col`}>
                    <div className="relative bg-white overflow-hidden flex items-center justify-center p-3" style={{ height: 180 }}>
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          loading="lazy"
                          style={{ maxHeight: '100%', maxWidth: '100%', width: 'auto', height: 'auto', objectFit: 'contain' }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">Sem imagem</div>
                      )}
                      <div className="absolute top-1 right-1 flex flex-col gap-1 items-end">
                        {/* Badge de divergência de estoque desativado temporariamente */}
                        {product.featured && <Badge className="bg-amber-500/90 text-white border-0 text-[9px] px-1.5 py-0">⭐</Badge>}
                        {product.on_sale && <Badge className="bg-emerald-500/90 text-white border-0 text-[9px] px-1.5 py-0">🏷️</Badge>}
                        {displayStock === 0 && <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Esgotado</Badge>}
                        {displayStock > 0 && v?.status === 'critical' && (
                          <Badge className="bg-orange-500/90 text-white border-0 text-[9px] px-1.5 py-0">Reestoque</Badge>
                        )}
                        {isMissingShippingDims(product, variationDimsByProduct[product.id]) && (
                          <Badge className="bg-red-600 text-white border-0 text-[9px] px-1.5 py-0" title="Produto sem peso/medidas — indisponível para envio">
                            ⚠ Sem medidas
                          </Badge>
                        )}
                        {product.pdv_only && (
                          <Badge className="bg-amber-600 text-white border-0 text-[9px] px-1.5 py-0" title="Produto exclusivo do PDV — não aparece no site">
                            🏪 Só PDV
                          </Badge>
                        )}
                      </div>

                    </div>
                    <div className="p-2.5 flex-1 flex flex-col gap-1.5">
                      <div>
                        <Badge variant="outline" className="text-[9px] mb-1 px-1.5 py-0">{product.category}</Badge>
                        <p className="font-semibold text-sm leading-tight line-clamp-2">{product.name}</p>
                      </div>
                      <div className="flex items-end justify-between gap-2 pt-0.5">
                        <div>
                          {displayPrice > 0 ? (
                            <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
                              {hasVars ? 'A partir de ' : ''}R$ {displayPrice.toFixed(2)}
                            </p>
                          ) : (
                            <p className="text-[10px] text-muted-foreground italic">Sem preço definido no PDV</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] text-muted-foreground uppercase font-semibold">Estoque</p>
                          <p className={`text-sm font-bold ${displayStock === 0 ? 'text-destructive' : ''}`}>{displayStock}</p>
                        </div>
                      </div>
                      <div
                        className={`text-[10px] flex items-center gap-1 px-1.5 py-1 rounded bg-muted/50 ${durationClass}`}
                        title={v ? `Velocidade: ${v.unitsPerDay.toFixed(2)} un/dia (${v.totalSold} vendidas em ${v.daysAnalyzed}d)` : 'Sem dados de venda'}
                      >
                        <span>⏱</span>
                        <span className="truncate">{durationLabel}</span>
                      </div>
                      <code className={`text-[9px] px-1.5 py-0.5 rounded font-mono truncate block min-h-[18px] ${product.sku ? 'bg-muted' : 'bg-transparent text-transparent select-none'}`}>
                        {product.sku || '—'}
                      </code>
                      <div className="flex gap-1 mt-auto pt-1.5 border-t">
                        <div className="flex-1"><ProductEdit product={product} onUpdate={loadProducts} /></div>
                        <Button variant="ghost" size="icon" className="hover:bg-primary/10 hover:text-primary shrink-0 h-8 w-8" onClick={() => setPurchaseDialog(product)} title="Adicionar à lista de compras">
                          <ShoppingBasket className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="hover:bg-destructive/10 hover:text-destructive shrink-0 h-8 w-8" onClick={() => handleDelete(product.id, product.image_url)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {showCreateModal && (
        <ProductEdit
          mode="create"
          onUpdate={loadProducts}
          open={showCreateModal}
          onOpenChange={setShowCreateModal}
          hideTrigger
        />
      )}

      {purchaseDialog && (
        <AddToPurchaseListDialog
          open={!!purchaseDialog}
          onOpenChange={(v) => !v && setPurchaseDialog(null)}
          productId={purchaseDialog.id}
          productName={purchaseDialog.name}
          currentStock={purchaseDialog.stock}
          minStock={(purchaseDialog as any).min_stock ?? 0}
        />
      )}
    </div>
  );
}
