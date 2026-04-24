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
import { Trash2, Package, Plus, Search, X } from 'lucide-react';
import { PanelHeader } from '@/components/admin/PanelHeader';
import { ProductEdit } from '@/components/ProductEdit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCategories } from '@/hooks/useCategories';
import { ProductVariations } from '@/components/ProductVariations';
import { SubcategorySelect } from '@/components/SubcategorySelect';
import { validateProductForm } from '@/utils/productValidation';
import { useSalesVelocity } from '@/hooks/useSalesVelocity';
import { ImageThumbWithBgRemoval } from '@/components/ImageThumbWithBgRemoval';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
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
}

export function ProductsManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { primaries } = useCategories();
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [stock, setStock] = useState('');
  const [sku, setSku] = useState('');
  const [minimumQuantity, setMinimumQuantity] = useState('1');
  const [soldByWeight, setSoldByWeight] = useState(false);
  const [brand, setBrand] = useState('');
  const [poundTest, setPoundTest] = useState('');
  const [size, setSize] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'in-stock' | 'out-of-stock' | 'on-sale' | 'featured' | 'restock'>('all');
  const { velocities } = useSalesVelocity({ daysWindow: 60, criticalDays: 7, warningDays: 14 });
  const [shortDescription, setShortDescription] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  // Preço PDV (PIX/Dinheiro). Débito e Crédito são calculados pela fórmula fixa.
  const [pricePdv, setPricePdv] = useState('');

  const { variations: newProductVariations, setVariations: setNewProductVariations, saveVariations } =
    useProductVariations();

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    const { data, error } = await supabase.from('products').select('*').order('name', { ascending: true });
    if (error) {
      toast({ title: 'Erro ao carregar produtos', description: error.message, variant: 'destructive' });
    } else {
      setProducts(data || []);
    }
  };

  const handleGenerateSummary = async () => {
    if (!description.trim()) {
      toast({ title: 'Atenção', description: 'Preencha a descrição antes de gerar o resumo.', variant: 'destructive' });
      return;
    }
    setGeneratingSummary(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-summary', { body: { description } });
      if (error) throw error;
      setShortDescription(data.summary);
      toast({ title: 'Resumo gerado!' });
    } catch (error: any) {
      toast({ title: 'Erro ao gerar resumo', description: error.message, variant: 'destructive' });
    } finally {
      setGeneratingSummary(false);
    }
  };

  const resetForm = () => {
    setName(''); setDescription(''); setShortDescription(''); setPrice(''); setCategory('');
    setSubcategory(''); setStock(''); setSku(''); setMinimumQuantity('1'); setSoldByWeight(false);
    setBrand(''); setPoundTest(''); setSize(''); setImages([]); setNewProductVariations([]);
    setPricePdv('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[ProductsManagement] handleSubmit called', { name, category, price, stock, variations: newProductVariations.length });
    const validationErrors = validateProductForm({ name, description, price, category, stock, images, variations: newProductVariations });
    if (validationErrors.length > 0) {
      const f = validationErrors[0];
      console.warn('[ProductsManagement] validation failed', validationErrors);
      toast({ title: `Erro: ${f.field}`, description: f.message, variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const imageUrls: string[] = [];
      if (images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const file = images[i];
          if (file.size > 5 * 1024 * 1024) {
            toast({ title: 'Imagem muito grande', description: `${file.name} excede 5MB.`, variant: 'destructive' });
            continue;
          }
          const fileExt = file.name.split('.').pop()?.toLowerCase();
          const fileName = `product-${Date.now()}-${i}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, file);
          if (uploadError) {
            toast({ title: 'Erro no upload', description: uploadError.message, variant: 'destructive' });
            continue;
          }
          const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
          imageUrls.push(publicUrl);
        }
      }

      const { data: newProduct, error: productError } = await supabase
        .from('products')
        .insert([{
          name, description, short_description: shortDescription,
          price: price ? parseFloat(price) : 0,
          category, subcategory: subcategory || null,
          stock: stock ? parseInt(stock) : 0,
          sku: sku || null,
          minimum_quantity: minimumQuantity ? parseInt(minimumQuantity) : 1,
          sold_by_weight: soldByWeight,
          brand: brand || null, pound_test: poundTest || null, size: size || null,
          images: imageUrls,
          image_url: imageUrls.length > 0 ? imageUrls[0] : null,
          created_by: user?.id,
          price_pdv: pricePdv ? parseFloat(pricePdv) : null,
          // Fórmula fixa: PIX/Dinheiro = base, Débito = +3%, Crédito = +4%
          price_cash_percent: 0,
          price_pix_percent: 0,
          price_debit_percent: 5,
          price_credit_percent: 10.25,
        }])
        .select()
        .single();

      if (productError) throw productError;

      try {
        await supabase.rpc('log_admin_access', {
          p_action: 'PRODUCT_CREATE',
          p_table_name: 'products',
          p_record_id: newProduct.id,
          p_details: { product_name: name, category, price: parseFloat(price), stock: parseInt(stock), has_variations: newProductVariations.length > 0 },
        });
      } catch {}

      if (newProductVariations.length > 0 && newProduct) {
        const processedVariations = await Promise.all(
          newProductVariations.map(async (variation) => {
            if (variation.image_url && variation.image_url.startsWith('data:')) {
              try {
                const response = await fetch(variation.image_url);
                const blob = await response.blob();
                const fileExt = blob.type.split('/')[1] || 'jpg';
                const fileName = `variation-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, blob);
                if (uploadError) return { ...variation, image_url: null };
                const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
                return { ...variation, image_url: publicUrl };
              } catch {
                return { ...variation, image_url: null };
              }
            }
            return variation;
          })
        );
        const { success, error } = await saveVariations(newProduct.id, processedVariations);
        if (!success) throw new Error(error || 'Erro ao salvar variações');
      }

      toast({ title: 'Produto adicionado!' });
      resetForm();
      setShowForm(false);
      loadProducts();
    } catch (error: any) {
      toast({ title: 'Erro ao adicionar produto', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
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

  const visibleProducts = products.filter((p) => p.category !== 'Pendente Revisão');
  const outOfStock = visibleProducts.filter((p) => p.stock === 0).length;
  const onSaleCount = visibleProducts.filter((p) => p.on_sale).length;
  const featuredCount = visibleProducts.filter((p) => p.featured).length;
  const totalStock = visibleProducts.reduce((sum, p) => sum + (p.stock || 0), 0);

  const restockIds = new Set(
    visibleProducts
      .filter((p) => {
        const v = velocities[p.id];
        return v && (v.status === 'critical' || v.status === 'out_of_stock');
      })
      .map((p) => p.id)
  );

  let filteredProducts = visibleProducts;
  if (filter === 'in-stock') filteredProducts = filteredProducts.filter((p) => p.stock > 0);
  if (filter === 'out-of-stock') filteredProducts = filteredProducts.filter((p) => p.stock === 0);
  if (filter === 'on-sale') filteredProducts = filteredProducts.filter((p) => p.on_sale);
  if (filter === 'featured') filteredProducts = filteredProducts.filter((p) => p.featured);
  if (filter === 'restock') filteredProducts = filteredProducts.filter((p) => restockIds.has(p.id));
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
            { label: 'Estoque total', value: totalStock, tone: 'primary' },
            { label: 'Esgotados', value: outOfStock, tone: 'danger' },
            { label: 'Promoção', value: onSaleCount, tone: 'success' },
            { label: 'Destaque', value: featuredCount, tone: 'warning' },
          ]}
        />
        <CardContent className="p-4 md:p-6 space-y-4">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Procurar por nome, categoria ou SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              onClick={() => {
                setShowForm((v) => {
                  const next = !v;
                  if (next) {
                    // Aguarda o formulário renderizar e rola até ele
                    setTimeout(() => {
                      document.getElementById('novo-produto-form')?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      });
                    }, 50);
                  }
                  return next;
                });
              }}
              className="gap-2"
            >
              {showForm ? <><X className="w-4 h-4" /> Fechar</> : <><Plus className="w-4 h-4" /> Novo Produto</>}
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
                const accent =
                  product.stock === 0 ? 'border-l-destructive'
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
                    <div className="aspect-square bg-muted relative overflow-hidden">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">Sem imagem</div>
                      )}
                      <div className="absolute top-1 right-1 flex flex-col gap-1">
                        {product.featured && <Badge className="bg-amber-500/90 text-white border-0 text-[9px] px-1.5 py-0">⭐</Badge>}
                        {product.on_sale && <Badge className="bg-emerald-500/90 text-white border-0 text-[9px] px-1.5 py-0">🏷️</Badge>}
                        {product.stock === 0 && <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Esgotado</Badge>}
                        {product.stock > 0 && v?.status === 'critical' && (
                          <Badge className="bg-orange-500/90 text-white border-0 text-[9px] px-1.5 py-0">Reestoque</Badge>
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
                          {product.on_sale && product.sale_price ? (
                            <>
                              <p className="line-through text-[10px] text-muted-foreground">R$ {product.price.toFixed(2)}</p>
                              <p className="text-sm font-bold text-emerald-600">R$ {product.sale_price.toFixed(2)}</p>
                            </>
                          ) : (
                            <p className="text-sm font-bold text-primary">R$ {product.price.toFixed(2)}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] text-muted-foreground uppercase font-semibold">Estoque</p>
                          <p className={`text-sm font-bold ${product.stock === 0 ? 'text-destructive' : ''}`}>{product.stock}</p>
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

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Adicionar Novo Produto</CardTitle>
            <CardDescription>Preencha os dados do produto</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Produto</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">Preço (R$) {newProductVariations.length > 0 && <span className="text-xs text-muted-foreground">(opcional com variações)</span>}</Label>
                  <Input id="price" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required={newProductVariations.length === 0} />
                </div>
              </div>

              {/* === Preço PDV (fórmula fixa por método) === */}
              <div className="space-y-3 p-4 border-2 border-primary/20 rounded-lg bg-primary/5">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide">Preço do PDV</h3>
                  <p className="text-xs text-muted-foreground">
                    PIX e Dinheiro = preço base. Débito = PIX + 5%. Crédito = Débito + 5%.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="price-pdv">Preço base PDV — PIX/Dinheiro (R$)</Label>
                  <Input id="price-pdv" type="number" step="0.01" placeholder="Se vazio, usa o preço do site" value={pricePdv} onChange={(e) => setPricePdv(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Preço do site: R$ {price ? parseFloat(price).toFixed(2) : '0.00'}</p>
                </div>

                {(() => {
                  const base = pricePdv ? parseFloat(pricePdv) : (price ? parseFloat(price) : 0);
                  const fmt = (v: number) => v.toFixed(2);
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                      <div className="rounded-md bg-background p-2 border">
                        <p className="text-[10px] uppercase text-muted-foreground">PIX</p>
                        <p className="text-sm font-bold">R$ {fmt(base)}</p>
                      </div>
                      <div className="rounded-md bg-background p-2 border">
                        <p className="text-[10px] uppercase text-muted-foreground">Dinheiro</p>
                        <p className="text-sm font-bold">R$ {fmt(base)}</p>
                      </div>
                      <div className="rounded-md bg-background p-2 border">
                        <p className="text-[10px] uppercase text-muted-foreground">Débito (+3%)</p>
                        <p className="text-sm font-bold">R$ {fmt(base * 1.03)}</p>
                      </div>
                      <div className="rounded-md bg-background p-2 border">
                        <p className="text-[10px] uppercase text-muted-foreground">Crédito (+4%)</p>
                        <p className="text-sm font-bold">R$ {fmt(base * 1.04)}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Categoria *</Label>
                  <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(''); }} required>
                    <SelectTrigger id="category"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {primaries.map((cat) => <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subcategory">Subcategoria (opcional)</Label>
                  <SubcategorySelect parentCategoryName={category} value={subcategory} onChange={setSubcategory} triggerId="subcategory" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sku">Código de Barras / SKU (opcional)</Label>
                  <Input id="sku" type="text" autoComplete="off" maxLength={50} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ex: 7891234567890" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stock">Estoque {newProductVariations.length > 0 && <span className="text-xs text-muted-foreground">(opcional com variações)</span>}</Label>
                  <Input id="stock" type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} required={newProductVariations.length === 0} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minimumQuantity">Quantidade Mínima de Venda</Label>
                  <Input id="minimumQuantity" type="number" min="1" value={minimumQuantity} onChange={(e) => setMinimumQuantity(e.target.value)} disabled={soldByWeight} />
                </div>
                <div className="flex items-center justify-between border p-3 rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="soldByWeight">Venda por Peso</Label>
                    <p className="text-sm text-muted-foreground">Produto vendido por quilo (kg)</p>
                  </div>
                  <Switch id="soldByWeight" checked={soldByWeight} onCheckedChange={setSoldByWeight} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição (opcional)</Label>
                <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="short-description">Resumo (para listagem)</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleGenerateSummary} disabled={generatingSummary}>
                    {generatingSummary ? 'Gerando...' : 'Gerar com IA'}
                  </Button>
                </div>
                <Textarea id="short-description" value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} rows={2} placeholder="Resumo curto" />
              </div>

              <ProductVariations variations={newProductVariations} onVariationsChange={setNewProductVariations} />

              <div className="space-y-2">
                <Label htmlFor="image">Imagens do Produto (múltiplas)</Label>
                {images.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {images.map((file, index) => (
                      <ImageThumbWithBgRemoval
                        key={index}
                        source={file}
                        alt={`Preview ${index + 1}`}
                        onRemove={() => setImages(images.filter((_, i) => i !== index))}
                        onBackgroundRemoved={(result) => {
                          if (result instanceof File) {
                            setImages(images.map((f, i) => (i === index ? result : f)));
                          }
                        }}
                      />
                    ))}
                  </div>
                )}
                <Input id="image" type="file" accept="image/*" multiple onChange={(e) => setImages([...images, ...Array.from(e.target.files || [])])} />
                <p className="text-xs text-muted-foreground">
                  Passe o mouse sobre uma imagem e clique em <span className="font-semibold">"Sem fundo"</span> para remover o fundo automaticamente com IA.
                </p>
              </div>

              <Button type="submit" disabled={uploading} className="w-full">
                {uploading ? 'Adicionando...' : 'Adicionar Produto'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
