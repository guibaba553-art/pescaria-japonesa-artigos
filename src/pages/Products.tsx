import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Star, ShoppingCart, Home, Plus, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCart } from '@/hooks/useCart';

interface Product {
  id: string;
  name: string;
  description: string;
  short_description?: string;
  price: number;
  category: string;
  image_url: string | null;
  rating: number;
  stock: number;
  featured: boolean;
  on_sale: boolean;
  sale_price?: number;
  sale_ends_at?: string;
}

const categories = [
  { name: 'Todas', value: '' },
  { name: 'Varas', value: 'Varas' },
  { name: 'Molinetes e Carretilhas', value: 'Molinetes e Carretilhas' },
  { name: 'Iscas', value: 'Iscas' },
  { name: 'Anzóis', value: 'Anzóis' },
  { name: 'Linhas', value: 'Linhas' },
  { name: 'Acessórios', value: 'Acessórios' },
  { name: 'Roupas', value: 'Roupas' },
];

export default function Products() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category') || '';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const { toast } = useToast();
  const { addItem } = useCart();

  const getQuantity = (productId: string) => quantities[productId] || 1;
  const setQuantity = (productId: string, qty: number) => {
    setQuantities(prev => ({ ...prev, [productId]: qty }));
  };

  useEffect(() => {
    loadProducts();
  }, [categoryParam]);

  const loadProducts = async () => {
    setLoading(true);
    let query = supabase
      .from('products')
      .select('*')
      .gt('stock', 0)
      .order('created_at', { ascending: false });

    if (categoryParam) {
      query = query.eq('category', categoryParam);
    }

    const { data, error } = await query;

    if (error) {
      toast({
        title: 'Erro ao carregar produtos',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  const handleCategoryChange = (category: string) => {
    if (category) {
      setSearchParams({ category });
    } else {
      setSearchParams({});
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 pt-24 pb-20">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => window.location.href = '/'}
        >
          <Home className="w-4 h-4 mr-2" />
          Voltar à Home
        </Button>

        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {categoryParam || 'Todos os Produtos'}
          </h1>
          <p className="text-xl text-muted-foreground mb-6">
            Encontre os melhores equipamentos de pesca
          </p>
          <div className="max-w-md mx-auto">
            <Input
              placeholder="Procurar produto por nome..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-lg"
            />
          </div>
        </div>

        {/* Filtros de Categoria */}
        <div className="flex flex-wrap gap-3 justify-center mb-12">
          {categories.map((cat) => (
            <Badge
              key={cat.value}
              variant={categoryParam === cat.value ? 'default' : 'outline'}
              className="cursor-pointer px-6 py-2 text-base hover:bg-primary hover:text-primary-foreground transition-colors"
              onClick={() => handleCategoryChange(cat.value)}
            >
              {cat.name}
            </Badge>
          ))}
        </div>

        {/* Lista de Produtos */}
        {loading ? (
          <div className="text-center py-20">
            <p className="text-xl text-muted-foreground">Carregando produtos...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-xl text-muted-foreground">
              Nenhum produto encontrado nesta categoria.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products
              .filter(product => 
                product.name.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((product) => (
              <Card 
                key={product.id}
                className="group overflow-hidden border-2 hover:border-primary transition-all duration-300 hover:shadow-xl"
              >
                <CardContent className="p-0">
                  <div 
                    className="relative overflow-hidden aspect-square cursor-pointer"
                    onClick={() => window.location.href = `/produto/${product.id}`}
                  >
                    <img
                      src={product.image_url || 'https://placehold.co/600x600?text=Sem+Imagem'}
                      alt={product.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                    <div className="absolute top-4 left-4 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-semibold">
                      {product.category}
                    </div>
                    {product.on_sale && (
                      <div className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-bold animate-pulse">
                        🏷️ PROMOÇÃO
                      </div>
                    )}
                  </div>
                  
                  <div className="p-6 space-y-4">
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < Math.floor(product.rating)
                              ? "fill-primary text-primary"
                              : "text-muted"
                          }`}
                        />
                      ))}
                      <span className="text-sm text-muted-foreground ml-2">
                        ({product.rating.toFixed(1)})
                      </span>
                    </div>
                    
                    <h3 className="font-bold text-xl">{product.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {product.short_description || product.description}
                    </p>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          {product.on_sale && product.sale_price ? (
                            <>
                              <span className="text-sm line-through text-muted-foreground">
                                R$ {product.price.toFixed(2)}
                              </span>
                              <span className="text-2xl font-bold text-red-600">
                                R$ {product.sale_price.toFixed(2)}
                              </span>
                              {product.sale_ends_at && new Date(product.sale_ends_at) > new Date() && (
                                <span className="text-xs text-muted-foreground">
                                  Até {new Date(product.sale_ends_at).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </>
                          ) : (
                            <p className="text-2xl font-bold text-primary">
                              R$ {product.price.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setQuantity(product.id, Math.max(1, getQuantity(product.id) - 1))}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <input
                          type="number"
                          min="1"
                          max={product.stock}
                          value={getQuantity(product.id)}
                          onChange={(e) => setQuantity(product.id, Math.max(1, Math.min(product.stock, parseInt(e.target.value) || 1)))}
                          className="w-14 text-center border rounded px-2 py-1 text-sm"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setQuantity(product.id, Math.min(product.stock, getQuantity(product.id) + 1))}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button 
                          className="flex-1"
                          onClick={() => {
                            const qty = getQuantity(product.id);
                            addItem({
                              id: product.id,
                              name: product.name,
                              price: product.on_sale && product.sale_price ? product.sale_price : product.price,
                              image_url: product.image_url
                            }, qty);
                            toast({
                              title: 'Produto adicionado!',
                              description: `${qty} unidade(s) adicionada(s) ao carrinho.`
                            });
                          }}
                        >
                          <ShoppingCart className="w-4 h-4 mr-2" />
                          Comprar
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
