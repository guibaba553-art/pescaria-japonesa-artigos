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
import { useToast } from '@/hooks/use-toast';
import { Trash2, ArrowLeft } from 'lucide-react';
import { Header } from '@/components/Header';
import { OrdersManagement } from '@/components/OrdersManagement';
import { ProductEdit } from '@/components/ProductEdit';
import { FeaturedProductRow } from '@/components/FeaturedProductRow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PRODUCT_CATEGORIES } from '@/config/constants';
import { ProductVariations } from '@/components/ProductVariations';
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
}

export default function Admin() {
  const navigate = useNavigate();
  const { user, isEmployee, isAdmin, loading, signOut } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [stock, setStock] = useState('');
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
            stock: stock ? parseInt(stock) : 0,
            images: imageUrls,
            image_url: imageUrls.length > 0 ? imageUrls[0] : null,
            created_by: user?.id
          }
        ])
        .select()
        .single();

      if (productError) throw productError;
      console.log('✅ Produto criado:', newProduct.id);

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
      setStock('');
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Header />
      <div className="max-w-7xl mx-auto space-y-8 p-6 pt-24">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Painel Administrativo</h1>
          <Button variant="outline" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao Site
          </Button>
        </div>

        <Tabs defaultValue="products" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="products">Produtos</TabsTrigger>
            <TabsTrigger value="orders">Pedidos</TabsTrigger>
            <TabsTrigger value="featured">Produtos Destaque</TabsTrigger>
          </TabsList>

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
                  <Label htmlFor="category">Categoria</Label>
                  <Select value={category} onValueChange={setCategory} required>
                    <SelectTrigger id="category">
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

        <Card>
          <CardHeader>
            <CardTitle>Produtos Cadastrados ({products.length})</CardTitle>
            <CardDescription>Gerencie os produtos da loja</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Imagem</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Estoque</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products
                  .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-16 h-16 object-cover rounded"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-muted rounded flex items-center justify-center text-xs">
                          Sem imagem
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.category}</TableCell>
                    <TableCell>
                      {product.on_sale && product.sale_price ? (
                        <div className="flex flex-col">
                          <span className="line-through text-muted-foreground text-xs">
                            R$ {product.price.toFixed(2)}
                          </span>
                          <span className="text-green-600 font-semibold">
                            R$ {product.sale_price.toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <span>R$ {product.price.toFixed(2)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {product.stock === 0 ? (
                        <span className="text-red-600 font-bold">ESGOTADO</span>
                      ) : (
                        <span>{product.stock} unidades</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {product.featured && (
                          <span className="text-xs bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded">
                            ⭐ Destaque
                          </span>
                        )}
                        {product.on_sale && (
                          <span className="text-xs bg-green-500/20 text-green-700 dark:text-green-400 px-2 py-0.5 rounded">
                            🏷️ Promoção
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                       <div className="flex gap-2 justify-end">
                         <ProductEdit product={product} onUpdate={loadProducts} />
                         <Button
                           variant="destructive"
                           size="sm"
                           onClick={() => handleDelete(product.id, product.image_url)}
                         >
                           <Trash2 className="w-4 h-4" />
                         </Button>
                       </div>
                     </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
        </Tabs>
      </div>
    </div>
  );
}
