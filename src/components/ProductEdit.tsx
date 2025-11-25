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
import { PRODUCT_CATEGORIES } from '@/config/constants';
import { Product } from '@/types/product';
import { ProductVariations } from '@/components/ProductVariations';
import { useProductVariations } from '@/hooks/useProductVariations';

interface ProductEditProps {
  product: Product;
  onUpdate: () => void;
}

export function ProductEdit({ product, onUpdate }: ProductEditProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [shortDescription, setShortDescription] = useState(product.short_description || '');
  const [price, setPrice] = useState(product.price.toString());
  const [category, setCategory] = useState(product.category);
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
  
  // Usar hook personalizado para gerenciar variações
  const { 
    variations, 
    setVariations, 
    loadVariations, 
    saveVariations 
  } = useProductVariations();

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

      // Atualizar dados do produto
      const { error: updateError } = await supabase
        .from('products')
        .update({
          name,
          description,
          short_description: shortDescription,
          price: price ? parseFloat(price) : 0,
          category,
          stock: stock ? parseInt(stock) : 0,
          sku: sku || null,
          minimum_quantity: minimumQuantity ? parseInt(minimumQuantity) : 1,
          sold_by_weight: soldByWeight,
          images: allImageUrls,
          image_url: allImageUrls[0] || null,
          featured,
          on_sale: onSale,
          sale_price: onSale && salePrice ? parseFloat(salePrice) : null,
          sale_ends_at: onSale && saleEndsAt ? new Date(saleEndsAt).toISOString() : null,
        })
        .eq('id', product.id);

      if (updateError) throw updateError;
      console.log('✅ Produto atualizado');

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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-category">Categoria</Label>
                <Select value={category} onValueChange={setCategory} required>
                  <SelectTrigger id="edit-category">
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                <Input
                  id="edit-sku"
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Digite o código de barras"
                  autoComplete="off"
                  maxLength={50}
                />
                <p className="text-xs text-muted-foreground">
                  Código para leitura no PDV
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
                    <div key={index} className="relative group">
                      <img
                        src={imgUrl}
                        alt={`Produto ${index + 1}`}
                        className="w-full h-24 object-cover rounded"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteImage(imgUrl)}
                      >
                        X
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Preview de novas imagens */}
              {newImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {newImages.map((file, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`Nova ${index + 1}`}
                        className="w-full h-24 object-cover rounded"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleRemoveNewImage(index)}
                      >
                        X
                      </Button>
                    </div>
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
                Adicione múltiplas imagens para o produto
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