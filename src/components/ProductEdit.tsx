import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Pencil } from 'lucide-react';
import { useCategories } from '@/hooks/useCategories';
import { Product } from '@/types/product';
import { ProductVariations } from '@/components/ProductVariations';
import { useProductVariations } from '@/hooks/useProductVariations';
import { SubcategorySelect } from '@/components/SubcategorySelect';
import { ImageThumbWithBgRemoval } from '@/components/ImageThumbWithBgRemoval';
import { BarcodeInput } from '@/components/BarcodeInput';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftRestoreBanner } from '@/components/DraftRestoreBanner';

interface ProductEditProps {
  product: Product;
  onUpdate: () => void;
}

export function ProductEdit({ product, onUpdate }: ProductEditProps) {
  const { toast } = useToast();
  const { categories, primaries, getSubcategoriesOf } = useCategories();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [shortDescription, setShortDescription] = useState(product.short_description || '');
  const [price, setPrice] = useState(product.price.toString());
  const [category, setCategory] = useState(product.category);
  const [subcategory, setSubcategory] = useState((product as any).subcategory || '');
  const [stock, setStock] = useState(product.stock.toString());
  const [existingImages, setExistingImages] = useState<string[]>(product.images || []);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [updating, setUpdating] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [featured, setFeatured] = useState(product.featured || false);
  const [onSale, setOnSale] = useState(product.on_sale || false);
  const [salePrice, setSalePrice] = useState(product.sale_price?.toString() || '');
  const [saleEndsAt, setSaleEndsAt] = useState(
    product.sale_ends_at ? new Date(product.sale_ends_at).toISOString().slice(0, 16) : ''
  );
  const [minimumQuantity, setMinimumQuantity] = useState(product.minimum_quantity?.toString() || '1');
  const [sku, setSku] = useState(product.sku || '');
  const [soldByWeight, setSoldByWeight] = useState(product.sold_by_weight || false);
  const [brand, setBrand] = useState(product.brand || '');
  const [poundTest, setPoundTest] = useState(product.pound_test || '');
  const [size, setSize] = useState(product.size || '');

  // Preço PDV (PIX/Dinheiro). Débito e Crédito são calculados pela fórmula fixa.
  const [pricePdv, setPricePdv] = useState((product as any).price_pdv?.toString() || '');

  // Peso e dimensões para cálculo de frete (Melhor Envio)
  const [weightGrams, setWeightGrams] = useState((product as any).weight_grams?.toString() || '');
  const [lengthCm, setLengthCm] = useState((product as any).length_cm?.toString() || '');
  const [widthCm, setWidthCm] = useState((product as any).width_cm?.toString() || '');
  const [heightCm, setHeightCm] = useState((product as any).height_cm?.toString() || '');
  
  // Usar hook personalizado para gerenciar variações
  const { 
    variations, 
    setVariations, 
    loadVariations, 
    saveVariations 
  } = useProductVariations();

  // Auto-save de rascunho durante a edição. Imagens não são persistidas.
  const draftData = {
    name, description, shortDescription, price, category, subcategory,
    stock, sku, minimumQuantity, soldByWeight, brand, poundTest, size,
    pricePdv, weightGrams, lengthCm, widthCm, heightCm,
    featured, onSale, salePrice, saleEndsAt,
    variations,
  };
  const { hasDraft, draftSavedAt, getDraft, clearDraft } = useFormDraft(
    `edit-product:${product.id}`,
    draftData,
    { enabled: open }
  );

  const restoreDraft = () => {
    const d = getDraft();
    if (!d) return;
    setName(d.name ?? product.name);
    setDescription(d.description ?? product.description);
    setShortDescription(d.shortDescription ?? '');
    setPrice(d.price ?? '');
    setCategory(d.category ?? product.category);
    setSubcategory(d.subcategory ?? '');
    setStock(d.stock ?? '');
    setSku(d.sku ?? '');
    setMinimumQuantity(d.minimumQuantity ?? '1');
    setSoldByWeight(!!d.soldByWeight);
    setBrand(d.brand ?? '');
    setPoundTest(d.poundTest ?? '');
    setSize(d.size ?? '');
    setPricePdv(d.pricePdv ?? '');
    setWeightGrams(d.weightGrams ?? '');
    setLengthCm(d.lengthCm ?? '');
    setWidthCm(d.widthCm ?? '');
    setHeightCm(d.heightCm ?? '');
    setFeatured(!!d.featured);
    setOnSale(!!d.onSale);
    setSalePrice(d.salePrice ?? '');
    setSaleEndsAt(d.saleEndsAt ?? '');
    if (Array.isArray(d.variations)) setVariations(d.variations);
    toast({ title: 'Rascunho restaurado' });
  };

  // Carregar variações quando o dialog abre
  useEffect(() => {
    if (open && product.id) {
      console.log('📂 Carregando dados do produto para edição:', product.id);
      
      // Carregar variações
      loadVariations(product.id);
      
      // Resetar estados do formulário
      setName(product.name);
      setDescription(product.description);
      setShortDescription(product.short_description || '');
      setPrice(product.price.toString());
      setCategory(product.category);
      setSubcategory((product as any).subcategory || '');
      setStock(product.stock.toString());
      setExistingImages(product.images || []);
      setNewImages([]);
      setFeatured(product.featured || false);
      setOnSale(product.on_sale || false);
      setSalePrice(product.sale_price?.toString() || '');
      setSaleEndsAt(product.sale_ends_at ? new Date(product.sale_ends_at).toISOString().slice(0, 16) : '');
      setMinimumQuantity(product.minimum_quantity?.toString() || '1');
      setSku(product.sku || '');
      setSoldByWeight(product.sold_by_weight || false);
      setBrand(product.brand || '');
      setPoundTest(product.pound_test || '');
      setSize(product.size || '');
      setPricePdv((product as any).price_pdv?.toString() || '');
      setWeightGrams((product as any).weight_grams?.toString() || '');
      setLengthCm((product as any).length_cm?.toString() || '');
      setWidthCm((product as any).width_cm?.toString() || '');
      setHeightCm((product as any).height_cm?.toString() || '');
    }
  }, [open, product.id, loadVariations]);

  const handleDeleteImage = (imageUrl: string) => {
    setExistingImages(existingImages.filter(img => img !== imageUrl));
  };

  const handleNewImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setNewImages([...newImages, ...files]);
  };

  const handleRemoveNewImage = (index: number) => {
    setNewImages(newImages.filter((_, i) => i !== index));
  };

  const handleGenerateSummary = async () => {
    if (!description.trim()) {
      toast({
        title: 'Atenção',
        description: 'Preencha a descrição antes de gerar o resumo.',
        variant: 'destructive',
      });
      return;
    }

    setGeneratingSummary(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-summary', {
        body: { description }
      });

      if (error) throw error;

      setShortDescription(data.summary);
      toast({
        title: 'Resumo gerado!',
        description: 'O resumo foi gerado com sucesso.',
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao gerar resumo',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);

    console.log('=== ATUALIZANDO PRODUTO ===');
    console.log('Produto ID:', product.id);
    console.log('Variações atuais:', variations.length);

    try {
      const allImageUrls = [...existingImages];

      // Upload de novas imagens
      for (let i = 0; i < newImages.length; i++) {
        const file = newImages[i];
        try {
          // Validar tamanho (máximo 5MB)
          if (file.size > 5 * 1024 * 1024) {
            toast({
              title: 'Imagem muito grande',
              description: `A imagem ${file.name} excede 5MB`,
              variant: 'destructive'
            });
            continue;
          }

          const fileExt = file.name.split('.').pop()?.toLowerCase();
          const fileName = `product-${Date.now()}-${i}.${fileExt}`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(fileName, file);

          if (uploadError) {
            console.error('Erro no upload:', uploadError);
            toast({
              title: 'Erro no upload',
              description: `Falha ao enviar ${file.name}`,
              variant: 'destructive'
            });
            continue;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('product-images')
            .getPublicUrl(fileName);

          allImageUrls.push(publicUrl);
        } catch (error: any) {
          console.error('Erro ao processar imagem:', error);
        }
      }

      // Deletar imagens removidas
      const deletedImages = (product.images || []).filter(img => !existingImages.includes(img));
      for (const imageUrl of deletedImages) {
        const fileName = imageUrl.split('/').pop();
        if (fileName) {
          await supabase.storage.from('product-images').remove([fileName]);
        }
      }

      // Detectar mudança manual de estoque do produto pai (sem variações).
      // Se mudou, registra como ajuste manual no livro-caixa em vez de update direto.
      const newStockValue = stock ? parseInt(stock) : 0;
      const stockChanged = newStockValue !== product.stock && variations.length === 0;
      const stockDelta = newStockValue - product.stock;

      // Atualizar dados do produto (SEM o campo stock, ele é gerenciado pelo livro-caixa)
      const productUpdate: any = {
        name,
        description,
        short_description: shortDescription,
        price: price ? parseFloat(price) : 0,
        category,
        subcategory: subcategory || null,
        sku: sku || null,
        minimum_quantity: minimumQuantity ? parseInt(minimumQuantity) : 1,
        sold_by_weight: soldByWeight,
        brand: brand || null,
        pound_test: poundTest || null,
        size: size || null,
        images: allImageUrls,
        image_url: allImageUrls[0] || null,
        featured,
        on_sale: onSale,
        sale_price: onSale && salePrice ? parseFloat(salePrice) : null,
        sale_ends_at: onSale && saleEndsAt ? new Date(saleEndsAt).toISOString() : null,
        price_pdv: pricePdv ? parseFloat(pricePdv) : null,
        // Fórmula fixa: PIX/Dinheiro = base, Débito = +3%, Crédito = +4%
        price_pix_percent: 0,
        price_cash_percent: 0,
        price_debit_percent: 5,
        price_credit_percent: 10.25,
        weight_grams: weightGrams ? parseInt(weightGrams) : null,
        length_cm: lengthCm ? parseFloat(lengthCm) : null,
        width_cm: widthCm ? parseFloat(widthCm) : null,
        height_cm: heightCm ? parseFloat(heightCm) : null,
      };

      // Se NÃO mudou o estoque, atualiza tudo de uma vez
      if (!stockChanged) {
        productUpdate.stock = newStockValue;
      }

      const { error: updateError } = await supabase
        .from('products')
        .update(productUpdate)
        .eq('id', product.id);

      if (updateError) throw updateError;

      // Se mudou o estoque, aplica via RPC atômica (registra no livro-caixa)
      if (stockChanged && stockDelta !== 0) {
        const { error: stockError } = await supabase.rpc('apply_stock_movement', {
          p_product_id: product.id,
          p_variation_id: null,
          p_quantity_delta: stockDelta,
          p_movement_type: 'manual_adjust',
          p_order_id: null,
          p_reason: `Ajuste manual no painel (de ${product.stock} para ${newStockValue})`,
        });
        if (stockError) {
          console.error('Erro ao ajustar estoque:', stockError);
          toast({ title: 'Aviso', description: 'Produto atualizado mas houve erro ao registrar movimentação de estoque', variant: 'destructive' });
        }
      }

      // Processar imagens das variações (converter base64 para URLs públicas)
      const processedVariations = await Promise.all(
        variations.map(async (variation) => {
          console.log(`🔍 Processando variação: ${variation.name}`);
          console.log(`📸 Image URL tipo:`, variation.image_url?.substring(0, 50));
          
          // Se a imagem for base64, fazer upload
          if (variation.image_url && variation.image_url.startsWith('data:')) {
            try {
              console.log(`📤 Fazendo upload da imagem da variação ${variation.name}`);
              
              // Converter base64 para blob
              const response = await fetch(variation.image_url);
              const blob = await response.blob();
              
              // Upload para o storage
              const fileExt = blob.type.split('/')[1] || 'jpg';
              const fileName = `variation-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
              
              console.log(`📤 Nome do arquivo: ${fileName}, tamanho: ${blob.size} bytes`);
              
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(fileName, blob);

              if (uploadError) {
                console.error('❌ Erro ao fazer upload:', uploadError);
                toast({
                  title: 'Erro ao salvar imagem',
                  description: `Não foi possível salvar a imagem da variação ${variation.name}`,
                  variant: 'destructive'
                });
                return { ...variation, image_url: null };
              }

              console.log('✅ Upload concluído:', uploadData.path);

              // Obter URL pública
              const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(fileName);

              console.log('✅ URL pública gerada:', publicUrl);
              return { ...variation, image_url: publicUrl };
              
            } catch (error) {
              console.error('❌ Erro ao processar imagem da variação:', error);
              toast({
                title: 'Erro',
                description: `Erro ao processar imagem da variação ${variation.name}`,
                variant: 'destructive'
              });
              return { ...variation, image_url: null };
            }
          }
          
          // Se não for base64, manter como está
          console.log(`✅ Variação ${variation.name} - imagem já é URL ou não tem imagem`);
          return variation;
        })
      );

      console.log('📊 Variações processadas:', processedVariations.length);

      // Salvar variações com URLs públicas
      const { success: varSuccess, error: varError } = await saveVariations(product.id, processedVariations);
      
      if (!varSuccess) {
        throw new Error(varError || 'Erro ao salvar variações');
      }

      toast({
        title: 'Produto atualizado!',
        description: 'As alterações foram salvas com sucesso.',
      });

      console.log('=== ATUALIZAÇÃO CONCLUÍDA ===');
      setOpen(false);
      onUpdate();
      
    } catch (error: any) {
      console.error('❌ Erro ao atualizar produto:', error);
      toast({
        title: 'Erro ao atualizar produto',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Pencil className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Produto</DialogTitle>
            <DialogDescription>
              Atualize as informações do produto
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome do Produto</Label>
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-price">
                  Preço (R$) {variations.length > 0 && <span className="text-xs text-muted-foreground">(opcional com variações)</span>}
                </Label>
                <Input
                  id="edit-price"
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required={variations.length === 0}
                />
                {variations.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Os preços serão definidos nas variações
                  </p>
                )}
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
                <Label htmlFor="edit-price-pdv">Preço base PDV — PIX/Dinheiro (R$)</Label>
                <Input
                  id="edit-price-pdv"
                  type="number"
                  step="0.01"
                  placeholder="Se vazio, usa o preço do site"
                  value={pricePdv}
                  onChange={(e) => setPricePdv(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Preço do site: R$ {price ? parseFloat(price).toFixed(2) : '0.00'}
                </p>
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
                <Label htmlFor="edit-category">Categoria *</Label>
                <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(''); }} required>
                  <SelectTrigger id="edit-category">
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {primaries.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-subcategory">Subcategoria (opcional)</Label>
                <SubcategorySelect
                  parentCategoryName={category}
                  value={subcategory}
                  onChange={setSubcategory}
                  triggerId="edit-subcategory"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-stock">
                  Estoque {variations.length > 0 && <span className="text-xs text-muted-foreground">(opcional com variações)</span>}
                </Label>
                <Input
                  id="edit-stock"
                  type="number"
                  min="0"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  required={variations.length === 0}
                />
                {variations.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    O estoque será controlado nas variações
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-minimumQuantity">Quantidade Mínima de Venda</Label>
                <Input
                  id="edit-minimumQuantity"
                  type="number"
                  min="1"
                  value={minimumQuantity}
                  onChange={(e) => setMinimumQuantity(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Quantidade mínima que deve ser comprada
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sku">Código de Barras (SKU)</Label>
                <BarcodeInput
                  id="edit-sku"
                  value={sku}
                  onChange={setSku}
                  placeholder="Digite o código de barras"
                />
                <p className="text-xs text-muted-foreground">
                  Código para leitura no PDV. Use "Gerar" se o produto não tiver código.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Descrição (opcional)</Label>
              <Textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-short-description">Resumo (para listagem)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary}
                >
                  {generatingSummary ? 'Gerando...' : 'Gerar com IA'}
                </Button>
              </div>
              <Textarea
                id="edit-short-description"
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                rows={2}
                placeholder="Resumo curto de 2 linhas (gerado automaticamente pela IA ou edite manualmente)"
              />
            </div>

            {/* === Peso e Dimensões para Frete === */}
            <div className="space-y-3 p-4 border-2 border-blue-500/20 rounded-lg bg-blue-500/5">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide">📦 Peso e Dimensões (Frete)</h3>
                <p className="text-xs text-muted-foreground">
                  Usado pelo Melhor Envio para calcular o frete real. Se vazio, usa valores padrão da loja.
                  Mínimos: 11×11×2 cm, peso ≥ 10 g.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-weight" className="text-xs">Peso (g)</Label>
                  <Input id="edit-weight" type="number" min="0" step="1" placeholder="500"
                    value={weightGrams} onChange={(e) => setWeightGrams(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-length" className="text-xs">Comprimento (cm)</Label>
                  <Input id="edit-length" type="number" min="0" step="0.1" placeholder="30"
                    value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-width" className="text-xs">Largura (cm)</Label>
                  <Input id="edit-width" type="number" min="0" step="0.1" placeholder="20"
                    value={widthCm} onChange={(e) => setWidthCm(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-height" className="text-xs">Altura (cm)</Label>
                  <Input id="edit-height" type="number" min="0" step="0.1" placeholder="20"
                    value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold">Configurações Especiais</h3>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="featured">Produto em Destaque</Label>
                  <p className="text-sm text-muted-foreground">
                    Exibir na seção de produtos em destaque
                  </p>
                </div>
                <Switch
                  id="featured"
                  checked={featured}
                  onCheckedChange={setFeatured}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="on-sale">Produto em Promoção</Label>
                  <p className="text-sm text-muted-foreground">
                    Ativar preço promocional
                  </p>
                </div>
                <Switch
                  id="on-sale"
                  checked={onSale}
                  onCheckedChange={setOnSale}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sold-by-weight">Venda por Peso</Label>
                  <p className="text-sm text-muted-foreground">
                    Produto vendido por quilo (kg)
                  </p>
                </div>
                <Switch
                  id="sold-by-weight"
                  checked={soldByWeight}
                  onCheckedChange={setSoldByWeight}
                />
              </div>

              {onSale && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-6">
                  <div className="space-y-2">
                    <Label htmlFor="sale-price">Preço Promocional (R$)</Label>
                    <Input
                      id="sale-price"
                      type="number"
                      step="0.01"
                      value={salePrice}
                      onChange={(e) => setSalePrice(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sale-ends">Promoção válida até</Label>
                    <Input
                      id="sale-ends"
                      type="datetime-local"
                      value={saleEndsAt}
                      onChange={(e) => setSaleEndsAt(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <ProductVariations
              variations={variations}
              onVariationsChange={setVariations}
            />

            <div className="space-y-2">
              <Label>Imagens do Produto</Label>

              {/* Imagens existentes */}
              {existingImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {existingImages.map((imgUrl, index) => (
                    <ImageThumbWithBgRemoval
                      key={imgUrl + index}
                      source={imgUrl}
                      alt={`Produto ${index + 1}`}
                      onRemove={() => handleDeleteImage(imgUrl)}
                      onBackgroundRemoved={async (result) => {
                        if (typeof result !== 'string') return;
                        // Converte o data URL em File e move para newImages para upload
                        try {
                          const res = await fetch(result);
                          const blob = await res.blob();
                          const file = new File(
                            [blob],
                            `imagem-${Date.now()}-sem-fundo.png`,
                            { type: 'image/png' }
                          );
                          setNewImages((prev) => [...prev, file]);
                          handleDeleteImage(imgUrl);
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Preview de novas imagens */}
              {newImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {newImages.map((file, index) => (
                    <ImageThumbWithBgRemoval
                      key={index}
                      source={file}
                      alt={`Nova ${index + 1}`}
                      onRemove={() => handleRemoveNewImage(index)}
                      onBackgroundRemoved={(result) => {
                        if (result instanceof File) {
                          setNewImages((prev) =>
                            prev.map((f, i) => (i === index ? result : f))
                          );
                        }
                      }}
                    />
                  ))}
                </div>
              )}

              <Input
                id="edit-images"
                type="file"
                accept="image/*"
                multiple
                onChange={handleNewImageChange}
              />
              <p className="text-sm text-muted-foreground">
                Adicione múltiplas imagens. Passe o mouse sobre uma imagem e clique em <span className="font-semibold">"Sem fundo"</span> para remover o fundo automaticamente com IA.
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={updating}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={updating}>
                {updating ? 'Atualizando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}