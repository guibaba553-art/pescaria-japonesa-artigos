import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, ShoppingCart, ArrowLeft, Home, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCart } from '@/hooks/useCart';
import { Product } from '@/types/product';
import { ProductQuantitySelector } from '@/components/ProductQuantitySelector';
import { ProductReviews } from '@/components/ProductReviews';

export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const { toast } = useToast();
  const { addItem } = useCart();

  useEffect(() => {
    loadProduct();
  }, [id]);

  // Autoplay das imagens
  useEffect(() => {
    if (!product) return;
    
    const allImages = product.images && product.images.length > 0 
      ? product.images 
      : (product.image_url ? [product.image_url] : []);

    if (allImages.length <= 1) return;

    const interval = setInterval(() => {
      setSelectedImage(current => {
        const currentIndex = allImages.indexOf(current);
        const nextIndex = (currentIndex + 1) % allImages.length;
        return allImages[nextIndex];
      });
    }, 3000); // Troca a cada 3 segundos

    return () => clearInterval(interval);
  }, [product]);

  const loadProduct = async () => {
    if (!id) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      toast({
        title: 'Erro ao carregar produto',
        description: error.message,
        variant: 'destructive'
      });
      navigate('/produtos');
    } else {
      setProduct(data);
      const firstImage = (data.images && data.images.length > 0) 
        ? data.images[0] 
        : (data.image_url || '');
      setSelectedImage(firstImage);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 pt-24 pb-20">
          <p className="text-center text-xl text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return null;
  }

  const allImages = product.images && product.images.length > 0 
    ? product.images 
    : (product.image_url ? [product.image_url] : []);

  const goToNextImage = () => {
    const currentIndex = allImages.indexOf(selectedImage);
    const nextIndex = (currentIndex + 1) % allImages.length;
    setSelectedImage(allImages[nextIndex]);
  };

  const goToPreviousImage = () => {
    const currentIndex = allImages.indexOf(selectedImage);
    const previousIndex = (currentIndex - 1 + allImages.length) % allImages.length;
    setSelectedImage(allImages[previousIndex]);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 pt-24 pb-20">
        <div className="flex gap-2 mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
          >
            <Home className="w-4 h-4 mr-2" />
            Home
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate('/produtos')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Produtos
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {/* Imagens */}
          <div className="space-y-4">
            <div className="relative aspect-square rounded-lg overflow-hidden border-2 border-border">
              <img
                key={selectedImage}
                src={selectedImage || 'https://placehold.co/600x600?text=Sem+Imagem'}
                alt={product.name}
                className="w-full h-full object-cover animate-in fade-in slide-in-from-right-4 duration-500"
              />
              
              {/* Setas de navegação */}
              {allImages.length > 1 && (
                <>
                  <button
                    onClick={goToPreviousImage}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all"
                    aria-label="Imagem anterior"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={goToNextImage}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all"
                    aria-label="Próxima imagem"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>
            
            {allImages.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {allImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImage(img)}
                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      selectedImage === img ? 'border-primary' : 'border-border'
                    }`}
                  >
                    <img
                      src={img}
                      alt={`${product.name} ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detalhes */}
          <div className="space-y-6">
            <div>
              <div className="flex gap-2 mb-3">
                <Badge>{product.category}</Badge>
                {product.on_sale && (
                  <Badge className="bg-red-600 hover:bg-red-700">
                    🏷️ PROMOÇÃO
                  </Badge>
                )}
              </div>
              <h1 className="text-4xl font-bold mb-4">{product.name}</h1>
              
              <div className="flex items-center gap-2 mb-6">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-5 h-5 ${
                        i < Math.floor(product.rating)
                          ? "fill-primary text-primary"
                          : "text-muted"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-lg text-muted-foreground">
                  ({product.rating.toFixed(1)})
                </span>
              </div>

              {product.on_sale && product.sale_price ? (
                <div className="mb-6">
                  <p className="text-2xl line-through text-muted-foreground">
                    R$ {product.price.toFixed(2)}
                  </p>
                  <p className="text-5xl font-bold text-red-600">
                    R$ {product.sale_price.toFixed(2)}
                  </p>
                  {product.sale_ends_at && new Date(product.sale_ends_at) > new Date() && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Promoção válida até {new Date(product.sale_ends_at).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-4xl font-bold text-primary mb-6">
                  R$ {product.price.toFixed(2)}
                </p>
              )}

              <p className="text-lg text-muted-foreground mb-2">
                Estoque disponível: <span className="font-semibold">{product.stock} unidades</span>
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Descrição</h2>
              <p className="text-base leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Quantidade</label>
                <ProductQuantitySelector
                  quantity={quantity}
                  maxQuantity={product.stock}
                  onIncrement={() => setQuantity(Math.min(product.stock, quantity + 1))}
                  onDecrement={() => setQuantity(Math.max(1, quantity - 1))}
                  onChange={setQuantity}
                  size="lg"
                />
              </div>

              <Button
                size="lg"
                className="w-full text-lg py-6"
                onClick={() => {
                  addItem({
                    id: product.id,
                    name: product.name,
                    price: product.on_sale && product.sale_price ? product.sale_price : product.price,
                    image_url: product.image_url
                  }, quantity);
                  toast({
                    title: 'Produto adicionado!',
                    description: `${quantity} unidade(s) adicionada(s) ao carrinho.`
                  });
                }}
              >
                <ShoppingCart className="w-5 h-5 mr-2" />
                Adicionar ao Carrinho
              </Button>
            </div>
          </div>
        </div>

        {/* Seção de avaliações */}
        <div className="mt-12">
          <ProductReviews productId={product.id} />
        </div>
      </div>
    </div>
  );
}