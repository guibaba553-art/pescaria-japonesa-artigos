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
