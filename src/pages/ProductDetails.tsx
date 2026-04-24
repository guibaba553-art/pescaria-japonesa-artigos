import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, ShoppingCart, ArrowLeft, Home, ChevronLeft, ChevronRight, Eye, Truck, ShieldCheck, RotateCcw, Flame } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCart } from '@/hooks/useCart';
import { Product, ProductVariation } from '@/types/product';
import { ProductQuantitySelector } from '@/components/ProductQuantitySelector';
import { ProductReviews } from '@/components/ProductReviews';
import { ProductVariationSelector } from '@/components/ProductVariationSelector';
import { recentSales, viewersNow } from '@/utils/socialProof';

export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [variations, setVariations] = useState<ProductVariation[]>([]);
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | null>(null);
  const [displayImages, setDisplayImages] = useState<string[]>([]);
  const { toast } = useToast();
  const { addItem } = useCart();

  useEffect(() => {
    loadProduct();
  }, [id]);

  // Preload de imagens das variações para carregamento rápido
  useEffect(() => {
    if (variations.length === 0) return;
    
    variations.forEach(variation => {
      if (variation.image_url) {
        const img = new Image();
        img.src = variation.image_url;
      }
    });
  }, [variations]);

  // Autoplay das imagens
  useEffect(() => {
    if (!product || displayImages.length <= 1) return;

    const interval = setInterval(() => {
      setSelectedImage(current => {
        const currentIndex = displayImages.indexOf(current);
        const nextIndex = (currentIndex + 1) % displayImages.length;
        return displayImages[nextIndex];
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [displayImages]);

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
      const productImages = (data.images && data.images.length > 0) 
        ? data.images 
        : (data.image_url ? [data.image_url] : []);
      
      setDisplayImages(productImages);
      setSelectedImage(productImages[0] || '');

      // Carregar variações
      const { data: variationsData } = await supabase
        .from('product_variations')
        .select('*')
        .eq('product_id', id);
      
      if (variationsData) {
        setVariations(variationsData);
      }
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div aria-hidden className="h-16 lg:h-[108px]" />
        <div className="container mx-auto px-4 py-20">
          <p className="text-center text-xl text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return null;
  }

  const goToNextImage = () => {
    const currentIndex = displayImages.indexOf(selectedImage);
    const nextIndex = (currentIndex + 1) % displayImages.length;
    setSelectedImage(displayImages[nextIndex]);
  };

  const goToPreviousImage = () => {
    const currentIndex = displayImages.indexOf(selectedImage);
    const previousIndex = (currentIndex - 1 + displayImages.length) % displayImages.length;
    setSelectedImage(displayImages[previousIndex]);
  };

  const productUrl = `${window.location.origin}/produto/${product.id}`;
  const productImage = displayImages[0] || 'https://lovable.dev/opengraph-image-p98pqg.png';
  const effectivePrice = product.on_sale && product.sale_price ? product.sale_price : product.price;
  const seoTitle = `${product.name} | JAPAS Pesca`;
  const seoDescription = (product.short_description || product.description || `Compre ${product.name} na JAPAS Pesca - artigos de pesca em Sinop MT.`).slice(0, 160);

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDescription} />
        <link rel="canonical" href={productUrl} />
        <meta property="og:type" content="product" />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDescription} />
        <meta property="og:image" content={productImage} />
        <meta property="og:url" content={productUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoTitle} />
        <meta name="twitter:description" content={seoDescription} />
        <meta name="twitter:image" content={productImage} />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            "name": product.name,
            "description": product.description,
            "image": displayImages.length > 0 ? displayImages : [productImage],
            "sku": product.sku || product.id,
            "category": product.category,
            "brand": { "@type": "Brand", "name": "JAPAS Pesca" },
            "offers": {
              "@type": "Offer",
              "url": productUrl,
              "priceCurrency": "BRL",
              "price": effectivePrice?.toFixed(2),
              "availability": product.stock > 0
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
              "seller": { "@type": "Organization", "name": "JAPAS Pesca" }
            },
            ...(product.rating ? {
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": product.rating,
                "reviewCount": Math.max(1, Math.round(product.rating))
              }
            } : {})
          })}
        </script>
      </Helmet>
      <Header />
      {/* Spacer for fixed Header */}
      <div aria-hidden className="h-16 lg:h-[108px]" />

      <div className="container mx-auto px-4 pt-6 pb-20">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <button onClick={() => navigate('/')} className="hover:text-primary transition-colors">
            Home
          </button>
          <span>/</span>
          <button onClick={() => navigate('/produtos')} className="hover:text-primary transition-colors">
            Produtos
          </button>
          <span>/</span>
          <button
            onClick={() => navigate(`/produtos?category=${encodeURIComponent(product.category)}`)}
            className="hover:text-primary transition-colors"
          >
            {product.category}
          </button>
        </nav>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {/* Imagens */}
          <div className="space-y-4">
            <div className="relative aspect-square rounded-2xl overflow-hidden border border-border bg-muted/30">
              <img
                key={selectedImage}
                src={selectedImage || 'https://placehold.co/600x600?text=Sem+Imagem'}
                alt={product.name}
                loading="eager"
                fetchPriority="high"
                className="w-full h-full object-cover animate-in fade-in slide-in-from-right-4 duration-300"
              />

              {product.on_sale && product.sale_price && (
                <div className="absolute top-3 left-3">
                  <span className="inline-flex items-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-black tracking-tight shadow-lg">
                    −{Math.round(((product.price - product.sale_price) / product.price) * 100)}% OFF
                  </span>
                </div>
              )}

              {/* Setas de navegação */}
              {displayImages.length > 1 && (
                <>
                  <button
                    onClick={goToPreviousImage}
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-background/90 hover:bg-background text-foreground rounded-full p-2 shadow-md transition-all"
                    aria-label="Imagem anterior"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={goToNextImage}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-background/90 hover:bg-background text-foreground rounded-full p-2 shadow-md transition-all"
                    aria-label="Próxima imagem"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {displayImages.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {displayImages.map((img, idx) => (
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
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detalhes */}
          <div className="space-y-5">
            <div>
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">
                {product.category}
              </p>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-black leading-tight mb-3">
                {product.name}
              </h1>

              <div className="flex items-center gap-2 mb-5">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${
                        i < Math.floor(product.rating)
                          ? "fill-primary text-primary"
                          : "text-muted-foreground/40"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">
                  {product.rating.toFixed(1)}
                </span>
              </div>

              {/* Preço comercial */}
              {variations.length > 0 ? (
                selectedVariation && (
                  <div className="bg-muted/40 rounded-2xl p-5 mb-4">
                    <p className="text-xs text-muted-foreground mb-1">Variação selecionada:</p>
                    <p className="text-4xl font-display font-black text-primary tracking-tight">
                      R$ {selectedVariation.price.toFixed(2).replace('.', ',')}
                    </p>
                    {selectedVariation.price >= 50 && (
                      <p className="text-sm text-muted-foreground mt-1">
                        ou <strong className="text-foreground">10x de R$ {(selectedVariation.price / 10).toFixed(2).replace('.', ',')}</strong> sem juros
                      </p>
                    )}
                  </div>
                )
              ) : (
                <div className="bg-muted/40 rounded-2xl p-5 mb-4">
                  {product.on_sale && product.sale_price ? (
                    <>
                      <p className="text-base line-through text-muted-foreground leading-none">
                        De R$ {product.price.toFixed(2).replace('.', ',')}
                      </p>
                      <div className="flex items-baseline gap-3 mt-1">
                        <p className="text-4xl sm:text-5xl font-display font-black text-primary tracking-tight leading-none">
                          R$ {product.sale_price.toFixed(2).replace('.', ',')}
                        </p>
                        <span className="text-sm font-bold text-primary">
                          {Math.round(((product.price - product.sale_price) / product.price) * 100)}% OFF
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-4xl sm:text-5xl font-display font-black text-primary tracking-tight leading-none">
                      R$ {product.price.toFixed(2).replace('.', ',')}
                    </p>
                  )}

                  {effectivePrice >= 50 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      ou <strong className="text-foreground">10x de R$ {(effectivePrice / 10).toFixed(2).replace('.', ',')}</strong> sem juros
                    </p>
                  )}

                  <div className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-md bg-success-soft text-success text-xs font-bold uppercase tracking-wide">
                    🚚 Envio rápido
                  </div>
                </div>
              )}

              {variations.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {product.stock > 5
                    ? `${product.stock} unidades em estoque`
                    : <span className="text-primary font-bold">⚡ Últimas {product.stock} unidades!</span>
                  }
                </p>
              )}
            </div>

            {/* Descrição - apenas se não tiver variações OU se tiver uma variação selecionada */}
            {(variations.length === 0 || selectedVariation) && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Descrição</h2>
                <p className="text-base leading-relaxed whitespace-pre-line">
                  {selectedVariation && selectedVariation.description 
                    ? selectedVariation.description 
                    : product.description}
                </p>
              </div>
            )}

            {variations.length > 0 && (
              <div className="space-y-4 border-t pt-6">
                <ProductVariationSelector
                  variations={variations}
                  onVariationSelect={(variation) => {
                    console.log('📦 Variação selecionada:', variation?.name);
                    setSelectedVariation(variation);
                    
                    if (variation?.image_url) {
                      // Tem imagem na variação - mostrar APENAS ela
                      console.log('✅ Mostrando imagem da variação:', variation.image_url);
                      setDisplayImages([variation.image_url]);
                      setSelectedImage(variation.image_url);
                    } else {
                      // Sem imagem na variação - voltar para imagens do produto
                      console.log('⬅️ Voltando para imagens do produto');
                      const productImages = (product.images && product.images.length > 0) 
                        ? product.images 
                        : (product.image_url ? [product.image_url] : []);
                      setDisplayImages(productImages);
                      setSelectedImage(productImages[0] || '');
                    }
                  }}
                />
              </div>
            )}

            <div className="space-y-4 border-t pt-6">
              <div>
                <label className="text-sm font-medium mb-2 block">Quantidade</label>
                <ProductQuantitySelector
                  quantity={quantity}
                  maxQuantity={selectedVariation ? selectedVariation.stock : product.stock}
                  onIncrement={() => setQuantity(Math.min(selectedVariation ? selectedVariation.stock : product.stock, quantity + 1))}
                  onDecrement={() => setQuantity(Math.max(1, quantity - 1))}
                  onChange={setQuantity}
                  size="lg"
                />
              </div>

              <Button
                size="lg"
                className="w-full text-base py-7 rounded-full font-black btn-press"
                disabled={
                  (variations.length > 0 && !selectedVariation) ||
                  (variations.length > 0 && selectedVariation && selectedVariation.stock === 0) ||
                  (variations.length === 0 && product.stock === 0)
                }
                onClick={() => {
                  // Impedir adicionar ao carrinho sem selecionar variação
                  if (variations.length > 0 && !selectedVariation) {
                    toast({
                      title: 'Selecione uma variação',
                      description: 'Por favor, selecione uma variação antes de adicionar ao carrinho.',
                      variant: 'destructive'
                    });
                    return;
                  }

                  // Validação extra de segurança
                  if (variations.length > 0 && selectedVariation && selectedVariation.stock === 0) {
                    toast({
                      title: 'Variação indisponível',
                      description: 'Por favor, selecione uma variação com estoque disponível.',
                      variant: 'destructive'
                    });
                    return;
                  }

                  if (variations.length === 0 && product.stock === 0) {
                    toast({
                      title: 'Produto esgotado',
                      description: 'Este produto está temporariamente fora de estoque.',
                      variant: 'destructive'
                    });
                    return;
                  }

                  const finalPrice = selectedVariation 
                    ? selectedVariation.price
                    : (product.on_sale && product.sale_price ? product.sale_price : product.price);
                  
                  addItem({
                    id: product.id,
                    name: selectedVariation 
                      ? `${product.name} - ${selectedVariation.name}`
                      : product.name,
                    price: finalPrice,
                    image_url: product.image_url,
                    variationId: selectedVariation?.id
                  }, quantity);
                  
                  toast({
                    title: 'Produto adicionado!',
                    description: `${quantity} unidade(s) adicionada(s) ao carrinho.`
                  });
                }}
              >
                <ShoppingCart className="w-5 h-5 mr-2" />
                {variations.length > 0 && !selectedVariation 
                  ? 'Selecione uma variação'
                  : (selectedVariation && selectedVariation.stock === 0)
                  ? 'Variação esgotada'
                  : (variations.length === 0 && product.stock === 0)
                  ? 'Produto esgotado'
                  : 'Adicionar ao Carrinho'
                }
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