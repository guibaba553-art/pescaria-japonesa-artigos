import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/hooks/useCart";
import { useProductQuantity } from "@/hooks/useProductQuantity";
import { Product } from "@/types/product";
import { ProductCard } from "./ProductCard";

const FeaturedProducts = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { addItem } = useCart();
  const { getQuantity, setQuantity, incrementQuantity, decrementQuantity } = useProductQuantity();

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
    <section className="py-24 bg-gradient-to-b from-background via-muted/10 to-background relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-6xl font-extrabold bg-gradient-to-r from-primary via-primary-glow to-secondary bg-clip-text text-transparent mb-6">
            Produtos em Destaque
          </h2>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
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
              <ProductCard
                key={product.id}
                product={product}
                quantity={getQuantity(product.id)}
                onQuantityChange={(qty) => setQuantity(product.id, qty)}
                onIncrement={() => incrementQuantity(product.id, product.stock)}
                onDecrement={() => decrementQuantity(product.id)}
                onAddToCart={() => {
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
                showDescription={false}
                variant="compact"
              />
            ))
          )}
        </div>
        
        <div className="text-center mt-16">
          <Button 
            size="lg" 
            className="border-2 border-primary/50 bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-secondary text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 px-10 py-6 text-lg font-bold"
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
