import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProductVariations } from '@/hooks/useProductVariations';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Trash2, ArrowLeft, TrendingUp, ShoppingCart, DollarSign, Calculator, Package, FileEdit, Tags, ClipboardList, Star, Receipt, Users } from 'lucide-react';
import { Header } from '@/components/Header';
import { PanelHeader } from '@/components/admin/PanelHeader';
import { OrdersManagement } from '@/components/OrdersManagement';
import { ProductEdit } from '@/components/ProductEdit';
import { FeaturedProductRow } from '@/components/FeaturedProductRow';
import { FiscalSystem } from '@/components/FiscalSystem';
import { EmployeesManagement } from '@/components/EmployeesManagement';
import { DraftProducts } from '@/components/DraftProducts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCategories } from '@/hooks/useCategories';
import { CategoriesManagement } from '@/components/CategoriesManagement';
import { ProductVariations } from '@/components/ProductVariations';
import { SubcategorySelect } from '@/components/SubcategorySelect';
import { validateProductForm } from '@/utils/productValidation';

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

export default function Admin() {
  const navigate = useNavigate();
  const { user, isEmployee, isAdmin, loading, signOut } = useAuth();
  const { toast } = useToast();
  const { categories: dbCategories, primaries, getSubcategoriesOf } = useCategories();
  const [products, setProducts] = useState<Product[]>([]);
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
  const [featuredSearchQuery, setFeaturedSearchQuery] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  
  // Usar hook personalizado para gerenciar variações
  const { 
    variations: newProductVariations, 
    setVariations: setNewProductVariations,
    saveVariations
  } = useProductVariations();

  useEffect(() => {
    if (!loading && !isEmployee && !isAdmin) {
      navigate('/auth');
    }
  }, [user, isEmployee, isAdmin, loading, navigate]);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      toast({
        title: 'Erro ao carregar produtos',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      setProducts(data || []);
    }
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

    // Validação centralizada
    const validationErrors = validateProductForm({
      name,
      description,
      price,
      category,
      stock,
      images,
      variations: newProductVariations
    });

    if (validationErrors.length > 0) {
      const firstError = validationErrors[0];
      toast({
        title: `Erro: ${firstError.field}`,
        description: firstError.message,
        variant: 'destructive'
      });
      return;
    }

    setUploading(true);
    console.log('=== CRIANDO NOVO PRODUTO ===');
    console.log('Variações:', newProductVariations.length);

    try {
      const imageUrls: string[] = [];

      // Upload de imagens (se houver)
      if (images.length > 0) {
        console.log('📤 Fazendo upload de', images.length, 'imagens...');
        
        for (let i = 0; i < images.length; i++) {
          const file = images[i];
          try {
            // Validar tamanho (máximo 5MB)
            if (file.size > 5 * 1024 * 1024) {
              toast({
                title: 'Imagem muito grande',
                description: `A imagem ${file.name} excede 5MB. Por favor, use uma imagem menor.`,
                variant: 'destructive'
              });
              continue;
            }

            const fileExt = file.name.split('.').pop()?.toLowerCase();
            const fileName = `product-${Date.now()}-${i}.${fileExt}`;
            
            console.log(`📤 Enviando imagem ${i + 1}/${images.length}:`, fileName);
            
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('product-images')
              .upload(fileName, file);

            if (uploadError) {
              console.error('❌ Erro no upload:', uploadError);
              toast({
                title: 'Erro no upload',
                description: `Falha ao enviar ${file.name}: ${uploadError.message}`,
                variant: 'destructive'
              });
              continue;
            }

            console.log('✅ Upload concluído:', uploadData.path);

            const { data: { publicUrl } } = supabase.storage
              .from('product-images')
              .getPublicUrl(fileName);

            imageUrls.push(publicUrl);
            console.log('✅ URL pública gerada:', publicUrl);
          } catch (imgError: any) {
            console.error('❌ Erro ao processar imagem:', imgError);
            toast({
              title: 'Erro',
              description: `Não foi possível processar ${file.name}`,
              variant: 'destructive'
            });
          }
        }
        
        if (imageUrls.length === 0) {
          toast({
            title: 'Aviso',
            description: 'Nenhuma imagem foi enviada. O produto será criado sem imagens.',
          });
        } else {
          console.log(`✅ ${imageUrls.length} imagem(ns) enviada(s) com sucesso`);
        }
      } else {
        console.log('ℹ️ Nenhuma imagem selecionada');
      }

      // Criar produto
      const { data: newProduct, error: productError } = await supabase
        .from('products')
        .insert([
          {
              name,
              description,
              short_description: shortDescription,
              price: price ? parseFloat(price) : 0,
              category,
              subcategory: subcategory || null,
              stock: stock ? parseInt(stock) : 0,
              sku: sku || null,
              minimum_quantity: minimumQuantity ? parseInt(minimumQuantity) : 1,
              sold_by_weight: soldByWeight,
              brand: brand || null,
              pound_test: poundTest || null,
              size: size || null,
              images: imageUrls,
              image_url: imageUrls.length > 0 ? imageUrls[0] : null,
              created_by: user?.id
            }
        ])
        .select()
        .single();

      if (productError) throw productError;
      console.log('✅ Produto criado:', newProduct.id);

      // Security: Audit logging for product creation
      try {
        await supabase.rpc('log_admin_access', {
          p_action: 'PRODUCT_CREATE',
          p_table_name: 'products',
          p_record_id: newProduct.id,
          p_details: { 
            product_name: name,
            category: category,
            price: parseFloat(price),
            stock: parseInt(stock),
            has_variations: newProductVariations.length > 0
          }
        });
      } catch (logError) {
        console.error('Failed to log audit:', logError);
      }

      // Processar imagens das variações (converter base64 para URLs públicas)
      if (newProductVariations.length > 0 && newProduct) {
        console.log(`🔄 Processando ${newProductVariations.length} variações...`);
        
        const processedVariations = await Promise.all(
          newProductVariations.map(async (variation) => {
            console.log(`🔍 Variação: ${variation.name}, tem imagem:`, !!variation.image_url);
            
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
                
                console.log(`📤 Upload: ${fileName}, ${blob.size} bytes`);
                
                const { data: uploadData, error: uploadError } = await supabase.storage
                  .from('product-images')
                  .upload(fileName, blob);

                if (uploadError) {
                  console.error('❌ Erro no upload:', uploadError);
                  toast({
                    title: 'Erro ao salvar imagem',
                    description: `Não foi possível salvar a imagem da variação ${variation.name}`,
                    variant: 'destructive'
                  });
                  return { ...variation, image_url: null };
                }

                console.log('✅ Upload OK:', uploadData.path);

                // Obter URL pública
                const { data: { publicUrl } } = supabase.storage
                  .from('product-images')
                  .getPublicUrl(fileName);

                console.log('✅ URL gerada:', publicUrl);
                return { ...variation, image_url: publicUrl };
              } catch (error) {
                console.error('❌ Erro ao processar:', error);
                toast({
                  title: 'Erro',
                  description: `Erro ao processar imagem da variação ${variation.name}`,
                  variant: 'destructive'
                });
                return { ...variation, image_url: null };
              }
            }
            
            console.log(`✅ Variação ${variation.name} sem mudança de imagem`);
            return variation;
          })
        );

        console.log('📊 Total de variações processadas:', processedVariations.length);

        // Salvar variações com URLs públicas
        const { success: varSuccess, error: varError } = await saveVariations(
          newProduct.id, 
          processedVariations
        );

        if (!varSuccess) {
          throw new Error(varError || 'Erro ao salvar variações');
        }
        
        console.log(`✅ ${processedVariations.length} variações salvas com sucesso`);
      }

      toast({
        title: 'Produto adicionado!',
        description: 'O produto foi adicionado com sucesso.'
      });

      // Limpar formulário
      setName('');
      setDescription('');
      setShortDescription('');
      setPrice('');
      setCategory('');
      setSubcategory('');
      setStock('');
      setSku('');
      setMinimumQuantity('1');
      setSoldByWeight(false);
      setBrand('');
      setPoundTest('');
      setSize('');
      setImages([]);
      setNewProductVariations([]);
      
      loadProducts();
      console.log('=== PRODUTO CRIADO COM SUCESSO ===');
      
    } catch (error: any) {
      console.error('❌ Erro ao adicionar produto:', error);
      toast({
        title: 'Erro ao adicionar produto',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, imageUrl: string | null) => {
    if (!confirm('Tem certeza que deseja deletar este produto?')) return;

    try {
      if (imageUrl) {
        const fileName = imageUrl.split('/').pop();
        if (fileName) {
          await supabase.storage.from('product-images').remove([fileName]);
        }
      }

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Security: Audit logging for product deletion
      try {
        const deletedProduct = products.find(p => p.id === id);
        await supabase.rpc('log_admin_access', {
          p_action: 'PRODUCT_DELETE',
          p_table_name: 'products',
          p_record_id: id,
          p_details: { 
            product_name: deletedProduct?.name,
            category: deletedProduct?.category
          }
        });
      } catch (logError) {
        console.error('Failed to log audit:', logError);
      }

      toast({
        title: 'Produto deletado',
        description: 'O produto foi removido com sucesso.'
      });

      loadProducts();
    } catch (error: any) {
      toast({
        title: 'Erro ao deletar produto',
        description: error.message,
        variant: 'destructive'
      });
    }
  };


  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!isEmployee && !isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />

      {/* Commercial dark banner */}
      <div className="bg-foreground text-background pt-20 lg:pt-32 pb-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider">Painel</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-black tracking-tight">
                Painel Administrativo
              </h1>
              <p className="text-sm text-background/60 mt-1">
                Gerencie produtos, pedidos, caixa e ferramentas fiscais.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground self-start md:self-end"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao Site
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6 p-6 -mt-4">
        {/* Cards de Acesso Rápido */}
        {isAdmin && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: TrendingUp, title: 'Dashboard', desc: 'Relatórios e análises', path: '/dashboard' },
              { icon: ShoppingCart, title: 'PDV', desc: 'Vendas presenciais', path: '/pdv' },
              { icon: DollarSign, title: 'Caixa', desc: 'Abertura e fechamento', path: '/fechamento-caixa' },
              { icon: Calculator, title: 'Fiscal', desc: 'IA, Excel e impostos', path: '/ferramentas-fiscais' },
            ].map(({ icon: Icon, title, desc, path }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="group text-left bg-card border border-border rounded-2xl p-4 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="font-display font-bold text-base">{title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
              </button>
            ))}
          </div>
        )}

        <Tabs defaultValue="catalog" className="space-y-6">
          {/* Navegação principal — botões no mesmo estilo dos cards de acesso rápido */}
          {(() => {
            const draftCount = products.filter(p => p.category === 'Pendente Revisão').length;
            const sections: Array<{
              value: string;
              title: string;
              desc: string;
              icon: typeof Package;
              badge?: number;
              adminOnly?: boolean;
            }> = [
              { value: 'catalog', title: 'Catálogo', desc: 'Produtos, categorias e destaques', icon: Package, badge: draftCount },
              { value: 'orders', title: 'Pedidos', desc: 'Vendas online', icon: ClipboardList },
              { value: 'employees', title: 'Funcionários', desc: 'Permissões da equipe', icon: Users, adminOnly: true },
            ];

            return (
              <TabsList className="h-auto p-0 bg-transparent grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 w-full">
                {sections
                  .filter(s => !s.adminOnly || isAdmin)
                  .map(({ value, title, desc, icon: Icon, badge }) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="group relative h-auto justify-start text-left bg-card border border-border rounded-2xl p-4 hover:border-primary/40 hover:shadow-md transition-all data-[state=active]:border-primary data-[state=active]:shadow-md data-[state=active]:bg-card data-[state=active]:text-foreground"
                    >
                      <div className="flex flex-col items-start w-full">
                        <div className="flex items-center justify-between w-full mb-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground transition-colors">
                            <Icon className="w-5 h-5" />
                          </div>
                          {badge !== undefined && badge > 0 && (
                            <Badge variant="secondary" className="h-5 min-w-5 px-1.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                              {badge}
                            </Badge>
                          )}
                        </div>
                        <div className="font-display font-bold text-base leading-tight">{title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 font-normal">{desc}</div>
                      </div>
                    </TabsTrigger>
                  ))}
              </TabsList>
            );
          })()}

          <TabsContent value="products" className="space-y-6">
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
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">
                    Preço (R$) {newProductVariations.length > 0 && <span className="text-xs text-muted-foreground">(opcional com variações)</span>}
                  </Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required={newProductVariations.length === 0}
                  />
                  {newProductVariations.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Os preços serão definidos nas variações
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Categoria *</Label>
                  <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(''); }} required>
                    <SelectTrigger id="category">
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
                  <Label htmlFor="subcategory">Subcategoria (opcional)</Label>
                  <SubcategorySelect
                    parentCategoryName={category}
                    value={subcategory}
                    onChange={setSubcategory}
                    triggerId="subcategory"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sku">Código de Barras / SKU (opcional)</Label>
                  <Input
                    id="sku"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Ex: 7891234567890"
                  />
                  <p className="text-xs text-muted-foreground">
                    Para uso com leitor de código de barras no PDV
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stock">
                    Estoque {newProductVariations.length > 0 && <span className="text-xs text-muted-foreground">(opcional com variações)</span>}
                  </Label>
                  <Input
                    id="stock"
                    type="number"
                    min="0"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    required={newProductVariations.length === 0}
                  />
                  {newProductVariations.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      O estoque será controlado nas variações
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minimumQuantity">Quantidade Mínima de Venda</Label>
                  <Input
                    id="minimumQuantity"
                    type="number"
                    min="1"
                    value={minimumQuantity}
                    onChange={(e) => setMinimumQuantity(e.target.value)}
                    disabled={soldByWeight}
                  />
                  <p className="text-xs text-muted-foreground">
                    {soldByWeight ? 'Não se aplica a produtos vendidos por peso' : 'Quantidade mínima que deve ser comprada (ex: 10 para tuviras)'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between border p-3 rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="soldByWeight">Venda por Peso</Label>
                  <p className="text-sm text-muted-foreground">
                    Produto vendido por quilo (kg)
                  </p>
                </div>
                <Switch
                  id="soldByWeight"
                  checked={soldByWeight}
                  onCheckedChange={setSoldByWeight}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição (opcional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="short-description">Resumo (para listagem)</Label>
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
                  id="short-description"
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  rows={2}
                  placeholder="Resumo curto de 2 linhas (gerado automaticamente pela IA ou edite manualmente)"
                />
              </div>

              <ProductVariations
                variations={newProductVariations}
                onVariationsChange={setNewProductVariations}
              />

              <div className="space-y-2">
                <Label htmlFor="image">Imagens do Produto (múltiplas)</Label>
                {images.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {images.map((file, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Preview ${index + 1}`}
                          className="w-full h-20 object-cover rounded"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                          onClick={() => setImages(images.filter((_, i) => i !== index))}
                        >
                          X
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <Input
                  id="image"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setImages([...images, ...files]);
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  Selecione múltiplas imagens para o produto
                </p>
              </div>

              <Button type="submit" disabled={uploading} className="w-full">
                {uploading ? 'Adicionando...' : 'Adicionar Produto'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mb-4">
          <Input
            placeholder="Procurar produto por nome..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>

        {(() => {
          const visibleProducts = products.filter(p => p.category !== 'Pendente Revisão');
          const filteredProducts = visibleProducts.filter(p =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()))
          );
          const outOfStock = visibleProducts.filter(p => p.stock === 0).length;
          const onSaleCount = visibleProducts.filter(p => p.on_sale).length;
          const featuredCount = visibleProducts.filter(p => p.featured).length;

          return (
            <Card className="overflow-hidden border-0 shadow-sm">
              <PanelHeader
                icon={Package}
                title="Produtos Cadastrados"
                description="Gerencie os produtos da loja"
                kpis={[
                  { label: 'Total', value: visibleProducts.length },
                  { label: 'Esgotados', value: outOfStock, tone: 'danger' },
                  { label: 'Promoção', value: onSaleCount, tone: 'success' },
                  { label: 'Destaque', value: featuredCount, tone: 'warning' },
                ]}
              />
              <CardContent className="p-4 md:p-6">
                {filteredProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-xl border border-dashed bg-muted/30">
                    <Package className="w-14 h-14 mb-3 opacity-40" />
                    <p className="text-sm font-medium">Nenhum produto encontrado</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {filteredProducts.map((product) => {
                      const accent =
                        product.stock === 0 ? 'border-l-destructive'
                        : product.on_sale ? 'border-l-emerald-500'
                        : product.featured ? 'border-l-amber-500'
                        : 'border-l-primary/40';
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
                                <p className={`text-sm font-bold ${product.stock === 0 ? 'text-destructive' : ''}`}>
                                  {product.stock === 0 ? '0' : product.stock}
                                </p>
                              </div>
                            </div>

                            {product.sku && (
                              <code className="text-[9px] bg-muted px-1.5 py-0.5 rounded font-mono truncate">{product.sku}</code>
                            )}

                            <div className="flex gap-1 mt-auto pt-1.5 border-t">
                              <div className="flex-1">
                                <ProductEdit product={product} onUpdate={loadProducts} />
                              </div>
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
          );
        })()}
          </TabsContent>

          <TabsContent value="categories">
            <CategoriesManagement />
          </TabsContent>

          <TabsContent value="drafts">
            <DraftProducts onChange={loadProducts} />
          </TabsContent>

          <TabsContent value="orders">
            <OrdersManagement />
          </TabsContent>

          <TabsContent value="featured">
            <div className="mb-4">
              <Input
                placeholder="Procurar produto por nome..."
                value={featuredSearchQuery}
                onChange={(e) => setFeaturedSearchQuery(e.target.value)}
                className="max-w-md"
              />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Gerenciar Produtos em Destaque</CardTitle>
                <CardDescription>Selecione quais produtos aparecerão na página inicial e configure promoções</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Imagem</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead className="text-center">Promoção</TableHead>
                      <TableHead className="text-center">Em Destaque</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products
                      .filter(p => p.name.toLowerCase().includes(featuredSearchQuery.toLowerCase()))
                      .map((product) => (
                        <FeaturedProductRow 
                          key={product.id} 
                          product={product} 
                          onUpdate={loadProducts}
                        />
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fiscal">
            <FiscalSystem />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="employees">
              <EmployeesManagement />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
