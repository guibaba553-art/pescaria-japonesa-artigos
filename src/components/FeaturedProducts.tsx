import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/hooks/useCart";

interface Product {
  id: string;
  name: string;
  description: string;
  short_description?: string;
  price: number;
  category: string;
  image_url: string | null;
  stock: number;
  rating: number;
}

const FeaturedProducts = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { addItem } = useCart();

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .gt('stock', 0) // Apenas produtos com estoque disponível
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
                  
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                    {product.short_description || product.description}
                  </p>
                  
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-2xl font-bold text-primary">
                      R$ {product.price.toFixed(2)}
                    </span>
                    <Button 
                      size="sm" 
                      className="bg-primary hover:bg-primary/90"
                      onClick={() => addItem({
                        id: product.id,
                        name: product.name,
                        price: product.price,
                        image_url: product.image_url
                      })}
                    >
                      <ShoppingCart className="w-4 h-4 mr-1" />
                      Comprar
                    </Button>
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
