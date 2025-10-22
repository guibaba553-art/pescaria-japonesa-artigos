import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Star, Plus, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/hooks/useCart";

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string | null;
  stock: number;
  rating: number;
  featured: boolean;
  on_sale: boolean;
  sale_price?: number;
  sale_ends_at?: string;
}

const FeaturedProducts = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const { toast } = useToast();
  const { addItem } = useCart();

  const getQuantity = (productId: string) => quantities[productId] || 1;
  const setQuantity = (productId: string, qty: number) => {
    setQuantities(prev => ({ ...prev, [productId]: qty }));
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .gt('stock', 0) // Apenas produtos com estoque disponível
      .eq('featured', true) // Apenas produtos em destaque
      .order('created_at', { ascending: false })
      .limit(4);

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

  if (loading) {
    return (
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Carregando produtos...</h2>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Produtos em Destaque
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Os produtos mais populares entre nossos clientes
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <p className="text-muted-foreground text-xl">Nenhum produto cadastrado ainda.</p>
            </div>
          ) : (
            products.map((product) => (
              <Card 
                key={product.id} 
                className="group hover:shadow-glow transition-all duration-300 overflow-hidden border-2 hover:border-primary/50"
              >
                <div 
                  className="relative overflow-hidden cursor-pointer"
                  onClick={() => navigate(`/produto/${product.id}`)}
                >
                  <img 
                    src={product.image_url || 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400'} 
                    alt={product.name}
                    className="w-full h-56 object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                  <div className="absolute top-4 right-4 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-bold">
                    {product.category}
                  </div>
                  {product.on_sale && (
                    <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-bold animate-pulse">
                      🏷️ PROMOÇÃO
                    </div>
                  )}
                </div>
                
                <CardContent className="p-6">
                  <div className="flex items-center gap-1 mb-2">
                    {[...Array(Math.floor(product.rating))].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                    ))}
                  </div>
                  
                  <h3 
                    className="text-xl font-bold text-foreground mb-2 cursor-pointer hover:text-primary transition-colors"
                    onClick={() => navigate(`/produto/${product.id}`)}
                  >
                    {product.name}
                  </h3>
                  
                  <div className="space-y-3 mt-4">
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
                        <span className="text-2xl font-bold text-primary">
                          R$ {product.price.toFixed(2)}
                        </span>
                      )}
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
                        size="sm" 
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
                        <ShoppingCart className="w-4 h-4 mr-1" />
                        Comprar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
        
        <div className="text-center mt-12">
          <Button 
            size="lg" 
            variant="outline" 
            className="border-2 border-primary text-primary hover:bg-primary/10"
            onClick={() => navigate('/produtos')}
          >
            Ver Todos os Produtos
          </Button>
        </div>
      </div>
    </section>
  );
};

export default FeaturedProducts;
